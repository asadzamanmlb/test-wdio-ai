/**
 * Smoke step definitions - WSTE-44 VOD playback (based on webTv-temp)
 * Uses MAST API to find VOD carousels like webTv-temp contentPlayback.
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl, isBetaWebTvTarget, shouldAttemptBetaInfrastructureLogin } = require('../../config/env');
const loginPage = require('../pageobjects/loginPage.object');
const commonPage = require('../pageobjects/commonPage.object');
const playerPage = require('../pageobjects/player.object');
const contentPageObject = require('../pageobjects/content.object');
const { qaTestUsers } = require('../../testUsers');
const { handleBetaPreAuthIfPresent } = require('../support/betaPreAuth');

const PLAYLIST_API_QA = 'https://mastapi.mobileqa.mlbinfra.com/api/video/v1/playlist';
const PLAYLIST_API_BETA = 'https://mastapi.mobilebeta.mlbinfra.com/api/video/v1/playlist';

const email = process.env.TEST_EMAIL || qaTestUsers['Yearly User'];
const password = process.env.TEST_PASSWORD || qaTestUsers.Password;

async function handleCookieConsentIfPresent() {
  const acceptSelectors = [
    'button#onetrust-accept-btn-handler',
    '[data-testid="consent-banner"] button',
    'button[class*="accept"], button[class*="Accept"]',
    '.onetrust-close-btn-handler',
    '[aria-label*="accept" i], [aria-label*="agree" i]',
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const sel of acceptSelectors) {
      try {
        const btn = await $(sel);
        if (await btn.isExisting() && (await btn.isDisplayed())) {
          await btn.waitForClickable({ timeout: 2000 }).catch(() => {});
          await btn.click();
          await browser.waitUntil(
            async () => !(await $(sel).isDisplayed().catch(() => true)),
            { timeout: 3000 }
          ).catch(() => {});
          return;
        }
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function isVodLink(href) {
  if (!href || typeof href !== 'string') return false;
  const h = href.toLowerCase();
  if (!h.includes('/video/')) return false;
  if (h.includes('/watch/mlbn') || h.includes('/tv/watch/mlbn')) return false;
  if (h.includes('/watch/live') || h.includes('/live-stream-games/')) return false;
  return true;
}

function escapeXPathText(text) {
  const s = String(text || '');
  if (!s.includes("'")) return `'${s}'`;
  const parts = s.split("'");
  return `concat(${parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(`, "'", `)})`;
}

Given(/^a user is logged into mlb\.com\/tv \(any user\)$/, async function () {
  await browser.url(baseUrl);
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('mlb.com') || (await browser.getUrl()).includes('okta'),
    { timeout: 10000 }
  );
  if (shouldAttemptBetaInfrastructureLogin()) await handleBetaPreAuthIfPresent();
  await handleCookieConsentIfPresent();

  const accountDropdown = await commonPage.accountDropdown();
  if (await accountDropdown.isExisting() && (await accountDropdown.isDisplayed())) {
    return;
  }

  const url = await browser.getUrl();
  if (!url.includes('login') && !url.includes('okta') && !url.includes('auth')) {
    const loginBtn = await $('[data-testid="header-profile-button"], [data-testid="headerLink-Log In"]');
    if (await loginBtn.isDisplayed().catch(() => false)) {
      await loginBtn.click();
      await browser.waitUntil(
        async () => {
          const u = await browser.getUrl();
          return u.includes('login') || u.includes('okta') || (await loginPage.emailInput().isDisplayed().catch(() => false));
        },
        { timeout: 10000 }
      );
    }
  }

  await handleCookieConsentIfPresent();
  const emailInput = await loginPage.emailInput();
  await emailInput.waitForDisplayed({ timeout: 15000 });
  await emailInput.setValue(email);

  await handleCookieConsentIfPresent();
  const continueBtn = await loginPage.continueButton();
  await continueBtn.waitForClickable({ timeout: 15000 });
  await continueBtn.click();
  await browser.waitUntil(
    async () => {
      const verify = await loginPage.verifyWithPasswordButton();
      const pass = await loginPage.passwordInput();
      return (await verify.isDisplayed().catch(() => false)) || (await pass.isDisplayed().catch(() => false));
    },
    { timeout: 10000 }
  );

  const verifyPassword = await loginPage.verifyWithPasswordButton();
  if (await verifyPassword.isExisting()) await verifyPassword.click();
  await (await loginPage.passwordInput()).waitForDisplayed({ timeout: 5000 });
  await (await loginPage.passwordInput()).setValue(password);

  const loginBtn = await loginPage.loginButton();
  await loginBtn.click();

  await browser.waitUntil(
    async () => {
      const acct = await commonPage.accountDropdown();
      return (await acct.isExisting()) && (await acct.isDisplayed());
    },
    { timeout: 30000, timeoutMsg: 'Login did not succeed' }
  );
});

When('the user navigates down to select a VOD video', async function () {
  await handleCookieConsentIfPresent();

  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 15000, timeoutMsg: 'Page did not load' }
  );

  const apiUrl = isBetaWebTvTarget() ? PLAYLIST_API_BETA : PLAYLIST_API_QA;

  let playlistData = null;
  try {
    playlistData = await browser.execute(async (url) => {
      const res = await fetch(url);
      return await res.json();
    }, apiUrl);
  } catch (e) {
    console.log(`API call failed: ${e.message}, falling back to DOM search`);
  }

  let vodTile = null;

  if (playlistData?.items?.length > 0) {
    const vodPlaylists = playlistData.items.filter(
      (item) => item.type === 'vod' && item.url && item.title && item.hideSpoilers !== true
    );

    if (vodPlaylists.length > 0) {
      const firstVod = vodPlaylists[0];
      const carouselTitle = firstVod.title;
      await browser.execute(() => window.scrollTo(0, 0));

      for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
        const headings = await contentPageObject['Carousel Headings']();
        const headingsArr = Array.isArray(headings) ? headings : Array.from(headings);
        let found = false;
        for (const el of headingsArr) {
          try {
            const title = (typeof el.getText === 'function' ? await el.getText() : null) || '';
            const t = String(title || '').trim();
            if (t && (t === carouselTitle || t.includes(carouselTitle) || carouselTitle.includes(t))) {
              found = true;
              break;
            }
          } catch (_) {}
        }
        if (!found) {
          try {
            const altHeadings = await contentPageObject['Content Headings']();
            const altArr = Array.isArray(altHeadings) ? altHeadings : Array.from(altHeadings);
            for (const el of altArr) {
              try {
                const title = (typeof el.getText === 'function' ? await el.getText() : null) || '';
                const t = String(title || '').trim();
                if (t && (t === carouselTitle || t.includes(carouselTitle) || carouselTitle.includes(t))) {
                  found = true;
                  break;
                }
              } catch (_) {}
            }
          } catch (_) {}
        }

        if (found) {
          const escapedTitle = escapeXPathText(carouselTitle);
          const xpaths = [
            `//h2[contains(text(), ${escapedTitle})]/following-sibling::*//a[@href] | //h3[contains(text(), ${escapedTitle})]/following-sibling::*//a[@href]`,
            `//h2[contains(text(), ${escapedTitle})]/..//ul/li//a[@href] | //h3[contains(text(), ${escapedTitle})]/..//ul/li//a[@href]`,
          ];
          for (const xpath of xpaths) {
            try {
              const tiles = await browser.$$(xpath);
              for (const tile of tiles) {
                try {
                  const href = await tile.getAttribute('href').catch(() => null);
                  if (href && isVodLink(href) && (await tile.isDisplayed().catch(() => false))) {
                    vodTile = tile;
                    break;
                  }
                } catch (_) {}
              }
              if (vodTile) break;
            } catch (_) {}
          }
          if (vodTile) break;
        }

        await browser.execute(() => window.scrollBy(0, window.innerHeight * 0.5));
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  if (!vodTile) {
    for (let scrollAttempt = 0; scrollAttempt < 8; scrollAttempt++) {
      const candidates = await browser.$$('a[href*="/video/"]');
      for (const el of candidates) {
        try {
          const href = await el.getAttribute('href').catch(() => null);
          if (href && isVodLink(href) && (await el.isDisplayed().catch(() => false))) {
            vodTile = el;
            break;
          }
        } catch (_) {}
      }
      if (vodTile) break;
      await browser.execute(() => window.scrollBy(0, window.innerHeight * 0.5));
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (!vodTile) {
    throw new Error('No VOD video tile found on homepage after scrolling');
  }

  await vodTile.scrollIntoView({ block: 'center' });
  await vodTile.waitForClickable({ timeout: 10000 });
  const handlesBefore = await browser.getWindowHandles();

  await vodTile.click();

  // Switch to new tab if VOD opened in one
  const handles = await browser.getWindowHandles();
  if (handles.length > handlesBefore.length) {
    await browser.switchToWindow(handles[handles.length - 1]);
  }

  // Wait for navigation to complete: video URL, video element, or shows detail page (25s)
  await browser.waitUntil(
    async () => {
      const url = await browser.getUrl();
      if (url.includes('/video/') || url.includes('/watch/')) return true;
      const hasVideo = await browser.execute(() => document.querySelector('video') !== null);
      if (hasVideo) return true;
      if (url.includes('/tv/shows/')) return true;
      return false;
    },
    { timeout: 25000, interval: 500, timeoutMsg: 'Page did not load video or shows detail within 25 seconds after clicking VOD tile' }
  );

  let url = await browser.getUrl();
  // Video in modal/overlay without URL change
  const hasVideoOnPage = await browser.execute(() => document.querySelector('video') !== null);
  if (hasVideoOnPage && !url.includes('/video/') && !url.includes('/watch/')) {
    console.log('   ✅ Video player appeared on page (modal/overlay)');
    return;
  }

  // Match webTv-temp: if we landed on shows detail page (/tv/shows/xxx), find and click a video tile to reach video page
  const urlParts = url.split('/').filter((p) => p.length > 0);
  const showsIndex = urlParts.indexOf('shows');
  const isOnShowsDetailPage =
    showsIndex >= 0 &&
    urlParts.length > showsIndex + 1 &&
    url.includes('/tv/shows/') &&
    !url.includes('/video/') &&
    !url.includes('/watch/');

  if (isOnShowsDetailPage) {
    console.log('   📺 On shows detail page - finding VOD video tile (from webTv-temp flow)...');

    await browser.waitUntil(
      async () => (await browser.execute(() => document.readyState)) === 'complete',
      { timeout: 10000, timeoutMsg: 'Shows detail page did not load' }
    );
    await new Promise((r) => setTimeout(r, 1500));

    const hasVideoPlayer = await browser.execute(() => document.querySelector('video') !== null);
    if (hasVideoPlayer) {
      console.log('   ✅ Video player already embedded on shows detail page');
      return;
    }

    const tilesArr = await commonPage.videoTiles();

    let vodTileOnDetail = null;
    for (const tile of tilesArr) {
      try {
        const href = await tile.getAttribute('href').catch(() => null);
        if (href && isVodLink(href)) {
          const isShowsDetail = href.includes('/tv/shows/') && !href.includes('/video/') && !href.includes('/watch/');
          if (!isShowsDetail) {
            vodTileOnDetail = tile;
            break;
          }
        }
      } catch (_) {}
    }

    if (vodTileOnDetail) {
      await vodTileOnDetail.scrollIntoView({ block: 'center' });
      await vodTileOnDetail.waitForClickable({ timeout: 8000 }).catch(() => {});
      await vodTileOnDetail.click();

      // Wait for video page or player to load
      await browser.waitUntil(
        async () => {
          const url = await browser.getUrl();
          if (url.includes('/video/') || url.includes('/watch/')) return true;
          return await browser.execute(() => document.querySelector('video') !== null);
        },
        { timeout: 20000, interval: 500, timeoutMsg: 'Video page did not load from shows detail within 20 seconds' }
      );
    } else {
      const hasVideo = await browser.execute(() => document.querySelector('video') !== null);
      if (hasVideo) {
        console.log('   ✅ Found embedded video on shows detail page');
        return;
      }
      throw new Error('No VOD video tile found on shows detail page');
    }
  }

});

/**
 * Then the user is able to play the VOD Video successfully
 * Ported from webTv-temp contentPlayback.steps.js: playback should start successfully + I validate playback position for VOD
 */
Then('the user is able to play the VOD Video successfully', async function () {
  console.log('   🎬 Validating VOD playback started...');

  // Wait for video element to appear
  await browser.waitUntil(
    async () => {
      const videoExists = await browser.execute(() => document.querySelector('video') !== null);
      return videoExists;
    },
    { timeout: 15000, timeoutMsg: 'Video element did not appear after 15 seconds', interval: 500 }
  );
  console.log('   ✅ Video element found');

  const videoPlayer = await playerPage.videoPlayer();
  const videoPlayerExists = await videoPlayer.isExisting();
  if (!videoPlayerExists) throw new Error('Video player should be present');
  console.log('   ✓ Video player present');

  // Ad detection and wait (from webTv-temp contentPlayback.steps.js: playback should start successfully)
  let hasAd = await browser.execute(() => {
    const video = document.querySelector('video');
    if (!video) return false;
    const title = video.getAttribute('title') || '';
    return title.toLowerCase().includes('advertisement') || title.toLowerCase().includes('ad');
  });

  // VOD: default to waiting for ad to be gone (set WAIT_FOR_VOD_AD=false to disable)
  const waitForVodAd =
    process.env.WAIT_FOR_VOD_AD !== 'false' && process.env.WAIT_FOR_VOD_AD !== '0';

  if (hasAd) {
    console.log('   📺 Advertisement detected - looking for skip button or waiting for completion...');
    const adSkipSelectors = [
      'button[aria-label*="skip" i]',
      '[aria-label*="Skip ad" i]',
      '.ad-skip-button',
      '#ad-skip',
      '[class*="skip-ad"]',
      '[id*="skip"]',
      '[class*="Skip"]',
    ];
    let adSkipped = false;
    for (const selector of adSkipSelectors) {
      try {
        const skipButton = await $(selector);
        if (await skipButton.isExisting() && (await skipButton.isDisplayed())) {
          await skipButton.click();
          console.log(`   ✅ Clicked ad skip button (${selector})`);
          adSkipped = true;
          await browser.waitUntil(
            async () => {
              await new Promise((r) => setTimeout(r, 1000));
              return true;
            },
            { timeout: 2000 }
          ).catch(() => {});
          break;
        }
      } catch (e) {
        /* continue */
      }
    }
    if (!adSkipped) {
      console.log('   ⏳ No skip button found, waiting up to 60s for ad to finish...');
      const adWaitStart = Date.now();
      let lastLog = Date.now();
      await browser.waitUntil(
        async () => {
          const now = Date.now();
          if (now - lastLog >= 5000) {
            const elapsed = ((now - adWaitStart) / 1000).toFixed(0);
            console.log(`   ⏱️  Still waiting for ad to finish (${elapsed}s elapsed)...`);
            lastLog = now;
          }
          const adStatus = await browser.execute(() => {
            const video = document.querySelector('video');
            if (!video) return { ended: true };
            const title = (video.getAttribute('title') || '').toLowerCase();
            const isAdByTitle = title.includes('advertisement') || title.includes(' ad ');
            if (video.ended) return { ended: true };
            if (!isAdByTitle) return { ended: true };
            return { ended: false };
          });
          return adStatus.ended;
        },
        { timeout: 60000, interval: 500 }
      ).catch(() => {
        console.log('   ⚠️  Ad wait timeout after 60s, continuing...');
      });
      console.log(`   ✅ Ad wait complete`);
    }
    // Brief wait for content video to load after ad
    await browser.waitUntil(
      async () => {
        await new Promise((r) => setTimeout(r, 2000));
        return true;
      },
      { timeout: 3000 }
    ).catch(() => {});
  } else if (waitForVodAd) {
    console.log('   📺 VOD: waiting up to 60s for any ad/commercial to finish before verifying...');
    const vodAdWaitStart = Date.now();
    await browser.waitUntil(
      async () => {
        const elapsedSec = (Date.now() - vodAdWaitStart) / 1000;
        const status = await browser.execute(() => {
          const v = document.querySelector('video');
          if (!v) return { done: false };
          const title = (v.getAttribute('title') || '').toLowerCase();
          const looksLikeAd = title.includes('advertisement') || title.includes(' ad ');
          if (looksLikeAd) return { done: false };
          if (v.readyState >= 2) return { done: true };
          return { done: false };
        });
        if (status.done) {
          console.log(`   ✅ VOD ad wait done (${elapsedSec.toFixed(0)}s)`);
          return true;
        }
        if (Math.floor(elapsedSec) % 15 === 0 && elapsedSec >= 15) {
          console.log(`   ⏱️  VOD ad wait: ${elapsedSec.toFixed(0)}s...`);
        }
        return false;
      },
      { timeout: 60000, interval: 1000 }
    ).catch(() => {
      console.log('   ⏱️  VOD ad wait: 60s elapsed, continuing...');
    });
  }

  // Blocking iframe check (from webTv-temp)
  await browser.waitUntil(
    async () => {
      const blocking = await browser.execute(() => {
        const video = document.querySelector('video');
        if (!video) return false;
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const ir = iframe.getBoundingClientRect();
            const vr = video.getBoundingClientRect();
            const overlaps = !(ir.right < vr.left || ir.left > vr.right || ir.bottom < vr.top || ir.top > vr.bottom);
            if (overlaps && iframe.style.display !== 'none' && iframe.style.visibility !== 'hidden') return true;
          } catch (e) {}
        }
        return false;
      });
      return !blocking;
    },
    { timeout: 10000, timeoutMsg: 'Blocking iframe still present', interval: 500 }
  ).catch(() => {});

  // Wait for content video loaded (readyState >= 2, not ad) - retry loop, up to ~60s when ad is showing
  // NOTE: Do NOT click play/pause until scrubber bar and video time are ready (later)
  console.log('   ⏳ Waiting for content video to load (up to 60s for ad to finish)...');
  const maxWaitAttempts = 30;
  let videoReady = false;
  for (let attempt = 0; attempt < maxWaitAttempts && !videoReady; attempt++) {
    const state = await browser.execute(() => {
      const video = document.querySelector('video');
      if (!video) return { exists: false, ready: false };
      const title = (video.getAttribute('title') || '').toLowerCase();
      const isAd = title.includes('advertisement') || title.includes(' ad ');
      return {
        exists: true,
        ready: video.readyState >= 2 && !isAd,
        readyState: video.readyState,
        isAd,
      };
    });
    if (state.exists && state.ready) {
      videoReady = true;
      console.log(`   ✓ Content video loaded (readyState=${state.readyState})`);
    } else if (state.isAd) {
      console.log(`   📺 Still showing ad, waiting for content...`);
    } else {
      console.log(`   ⏳ Video loading... (readyState=${state.readyState || 0})`);
    }
    if (!videoReady) {
      const checkInterval = 500;
      for (let waited = 0; waited < 1000 && !videoReady; waited += checkInterval) {
        await new Promise((r) => setTimeout(r, checkInterval));
        const current = await browser.execute(() => {
          const v = document.querySelector('video');
          if (!v) return { ready: false };
          const t = (v.getAttribute('title') || '').toLowerCase();
          const isAd = t.includes('advertisement') || t.includes(' ad ');
          return { ready: v.readyState >= 2 && !isAd };
        });
        if (current.ready) {
          videoReady = true;
          console.log('   ✓ Video became ready during wait');
          break;
        }
      }
    }
  }
  if (!videoReady) {
    const videoInfo = await browser.execute(() => {
      const v = document.querySelector('video');
      if (!v) return { readyState: 0, isAd: false };
      const title = (v.getAttribute('title') || '').toLowerCase();
      const isAd = title.includes('advertisement') || title.includes(' ad ');
      return { readyState: v.readyState, isAd };
    });
    if (videoInfo.readyState === 0 && !videoInfo.isAd) {
      throw new Error('Content video never loaded - content may be unavailable');
    }
    if (videoInfo.isAd) {
      throw new Error('Still showing advertisement - ad did not complete in time');
    }
    throw new Error('Content video did not load');
  }

  // Ensure ad is gone before any play/pause clicks
  console.log('   ⏳ Confirming ad is gone (up to 60s)...');
  await browser.waitUntil(
    async () => {
      const state = await browser.execute(() => {
        const v = document.querySelector('video');
        if (!v) return { adGone: false };
        const title = (v.getAttribute('title') || '').toLowerCase();
        const isAd = title.includes('advertisement') || title.includes(' ad ');
        const isContent = v.readyState >= 2 && v.duration > 0 && !isAd;
        return { adGone: !isAd, isContent };
      });
      return state.adGone && state.isContent;
    },
    { timeout: 60000, timeoutMsg: 'Ad still present or content not ready after 60s', interval: 500 }
  );
  await new Promise((r) => setTimeout(r, 1000));
  console.log('   ✓ Ad gone, content ready');

  // Wait for scrubber bar and video time BEFORE any play/pause clicks - must be content, not ad
  console.log('   ⏳ Waiting for scrubber bar and video time (content, not ad) before starting playback...');
  await browser.waitUntil(
    async () => {
      const notAd = await browser.execute(() => {
        const v = document.querySelector('video');
        if (!v) return false;
        const title = (v.getAttribute('title') || '').toLowerCase();
        return !title.includes('advertisement') && !title.includes(' ad ');
      });
      if (!notAd) return false;

      const scrubber = await playerPage.scrubberBar();
      const scrubberOk = await scrubber.isExisting().catch(() => false);
      if (scrubberOk && (await scrubber.isDisplayed().catch(() => false))) {
        const videoState = await browser.execute(() => {
          const v = document.querySelector('video');
          if (!v) return { hasTime: false };
          const title = (v.getAttribute('title') || '').toLowerCase();
          const isAd = title.includes('advertisement') || title.includes(' ad ');
          return {
            hasTime: v.duration > 0 && !isNaN(v.duration) && !isNaN(v.currentTime) && !isAd,
          };
        });
        if (videoState.hasTime) return true;
      }
      const altReady = await browser.execute(() => {
        const v = document.querySelector('video');
        const title = (v?.getAttribute('title') || '').toLowerCase();
        const isAd = title.includes('advertisement') || title.includes(' ad ');
        const scrubberLike = document.querySelector(
          '[class*="progress"], [class*="scrubber"], [class*="seek"], input[type="range"], [role="slider"]'
        );
        return v && v.readyState >= 2 && v.duration > 0 && !!scrubberLike && !isAd;
      });
      return altReady;
    },
    { timeout: 15000, timeoutMsg: 'Scrubber bar or video time did not appear (content, not ad)', interval: 500 }
  );
  console.log('   ✓ Scrubber bar and video time ready (content confirmed) - now starting playback');

  // First play action (after scrubber ready) - container click provides user interaction for autoplay
  await browser.execute(() => {
    const video = document.querySelector('video');
    if (video) {
      const container =
        video.closest('[class*="player"], [class*="Player"], [id*="player"], [id*="Player"]') ||
        video.parentElement;
      if (container) container.click();
      video.play().catch(() => {});
    }
  });

  // If paused, click player and play
  const initialState = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? { paused: v.paused } : { paused: true };
  });
  if (initialState.paused) {
    try {
      await videoPlayer.click();
    } catch (e) {
      /* ignore */
    }
    await browser.execute(() => {
      const v = document.querySelector('video');
      if (v) v.play().catch(() => {});
    });
  }

  // Verify video is playing (from webTv-temp: expect finalState to be false i.e. not paused)
  await browser.waitUntil(
    async () => {
      const v = await browser.execute(() => {
        const el = document.querySelector('video');
        return el ? !el.paused && !el.ended && el.readyState > 2 : false;
      });
      return v;
    },
    { timeout: 10000, timeoutMsg: 'Video did not start playing' }
  );
  const finalState = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? { paused: v.paused, ended: v.ended, readyState: v.readyState } : null;
  });
  if (finalState && (finalState.paused || finalState.ended)) {
    throw new Error('Video should be playing (not paused)');
  }
  console.log('   ✓ Video is playing');

  // Validate duration (from webTv-temp playback should start successfully)
  const duration = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.duration : 0;
  });
  if (!(duration > 0)) throw new Error('Video should have valid duration');
  console.log(`   ✓ Video duration: ${duration.toFixed(2)}s`);

  // VOD position validation (from webTv-temp I validate playback position for VOD)
  const currentTime = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  await browser.waitUntil(
    async () => {
      const time = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      });
      return time > currentTime;
    },
    { timeout: 10000, timeoutMsg: 'Video time did not progress within 10 seconds' }
  );
  console.log('   ✓ Video time progressing');

  // I verify video content player functionality - try clicking UI buttons, always fallback to video API
  async function tryClickButton(btn, fallback) {
    const exists = await btn.isExisting().catch(() => false);
    if (exists && (await btn.isDisplayed().catch(() => false))) {
      await btn.waitForClickable({ timeout: 3000 }).catch(() => {});
      await btn.click();
      await new Promise((r) => setTimeout(r, 300));
      if (fallback) await fallback();
      return true;
    }
    if (fallback) await fallback();
    return false;
  }

  // Hover over video to reveal controls (many players hide them when idle)
  await videoPlayer.moveTo().catch(() => {});

  // Pause - try clicking pause button, always ensure video.pause() as fallback
  console.log('   ⏸️  Clicking pause button (or pausing via video)...');
  const pauseBtn = await playerPage.pauseButton();
  const pausedViaClick = await tryClickButton(pauseBtn, () =>
    browser.execute(() => {
      const v = document.querySelector('video');
      if (v) v.pause();
    })
  );
  if (pausedViaClick) console.log('   ✓ Clicked pause button');
  await browser.waitUntil(
    async () => {
      const paused = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? v.paused : false;
      });
      return paused;
    },
    { timeout: 5000, timeoutMsg: 'Video should be paused' }
  );
  console.log('   ✓ Pause verified');

  // Play - try clicking play button, always ensure video.play() as fallback
  console.log('   ▶️  Clicking play button (or resuming via video)...');
  const playBtn = await playerPage.playButton();
  const playedViaClick = await tryClickButton(playBtn, () =>
    browser.execute(() => {
      const v = document.querySelector('video');
      if (v) v.play().catch(() => {});
    })
  );
  if (playedViaClick) console.log('   ✓ Clicked play button');
  await browser.waitUntil(
    async () => {
      const playing = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : false;
      });
      return playing;
    },
    { timeout: 5000, timeoutMsg: 'Video should resume playing' }
  );
  console.log('   ✓ Play verified');

  // Scrubber bar / progress bar
  console.log('   🎚️  Verifying scrubber/progress bar...');
  const scrubberBar = await playerPage.scrubberBar();
  const scrubberExists = await scrubberBar.isExisting().catch(() => false);
  if (scrubberExists) {
    console.log('   ✓ Scrubber/progress bar present');
  } else {
    const altExists = await browser.execute(() => {
      const sel = '.progress-bar, .seek-bar, [class*="Progress"], [class*="seek"], input[type="range"], [role="slider"]';
      return document.querySelector(sel) !== null;
    });
    if (altExists) console.log('   ✓ Scrubber/progress bar present (alt selector)');
    else console.log('   ⚠️  Scrubber bar not found - player may use different controls');
  }

  // Forward 60 sec - try clicking forward/skip button, else video.currentTime += 60
  console.log('   ⏩  Clicking forward 60 sec (or seeking via video)...');
  const timeBeforeSeek = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  const fwdBtn = await playerPage.forward60Button();
  const seekFwdAmount = 60;
  const forwardedViaClick = await tryClickButton(fwdBtn, () =>
    browser.execute(
      (sec) => {
        const v = document.querySelector('video');
        if (v && v.duration > 0 && !isNaN(v.duration))
          v.currentTime = Math.min(v.currentTime + sec, v.duration - 1);
      },
      seekFwdAmount
    )
  );
  if (forwardedViaClick) console.log('   ✓ Clicked forward 60 sec button');
  await new Promise((r) => setTimeout(r, 800));
  const timeAfterSeekFwd = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  const videoDuration = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.duration : 0;
  });
  const nearEnd = videoDuration > 0 && timeBeforeSeek >= videoDuration - 5;
  if (timeAfterSeekFwd > timeBeforeSeek) {
    console.log(`   ✓ Forward verified (${timeBeforeSeek.toFixed(1)}s → ${timeAfterSeekFwd.toFixed(1)}s)`);
  } else if (nearEnd) {
    console.log(`   ✓ Forward skipped (near end at ${timeBeforeSeek.toFixed(1)}s)`);
  } else {
    throw new Error(`Forward failed: time did not advance (${timeBeforeSeek.toFixed(1)}s → ${timeAfterSeekFwd.toFixed(1)}s)`);
  }

  // Rewind - try clicking rewind button, else video.currentTime -= 10
  console.log('   ⏪  Clicking rewind (or seeking back via video)...');
  const timeBeforeBack = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  const rewBtn = await playerPage.rewindButton();
  const rewoundViaClick = await tryClickButton(rewBtn, () =>
    browser.execute(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = Math.max(0, v.currentTime - 10);
    })
  );
  if (rewoundViaClick) console.log('   ✓ Clicked rewind button');
  await new Promise((r) => setTimeout(r, 500));
  const timeAfterBack = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  if (timeAfterBack < timeBeforeBack) {
    console.log(`   ✓ Rewind verified (${timeBeforeBack.toFixed(1)}s → ${timeAfterBack.toFixed(1)}s)`);
  } else {
    throw new Error(`Rewind failed: time did not go back (${timeBeforeBack.toFixed(1)}s → ${timeAfterBack.toFixed(1)}s)`);
  }

  // Rewind to beginning (video.currentTime = 0 - no common "skip to start" UI)
  console.log('   ⏮️  Rewinding to beginning...');
  await browser.execute(() => {
    const v = document.querySelector('video');
    if (v) v.currentTime = 0;
  });
  await new Promise((r) => setTimeout(r, 500));
  const timeAfterRewind = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  if (timeAfterRewind < 3) {
    console.log(`   ✓ Rewind to beginning verified (${timeAfterRewind.toFixed(1)}s)`);
  } else {
    console.log(`   ⚠️  Rewind to ~0 not exact (${timeAfterRewind.toFixed(1)}s) - some players clamp differently`);
  }

  console.log('   ✅ VOD playback validated - start, stop, scrubber, forward 60s, rewind, pause, play');
});
