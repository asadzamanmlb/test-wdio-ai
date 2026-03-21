const qaTestUsers = {
  "Free User": "wscata+free@mlb.com", // Entitlements: none
  "Yearly User": "wscata+tv@mlb.com", // Entitlements: MLBALL, SUBSCRIBERVOD, MiLBALL, MLBN
  "MLB Audio User": "wscata+mlbaudio@mlb.com", // Entitlements: MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Extra Innings User": "wscata+extra@mlb.com", // Entitlements: MLBVIDEOADOBEPASS, SUBSCRIBERVOD
  "TMobile User": "wscata+tmobile@mlb.com", // Entitlements: MLBVIDEOAR, SUBSCRIBERVOD
  "MLBN Only User": "wscata+mlbn@mlb.com", // Entitlements: MLBN
  "Braves User": "wscata+braves@mlb.com", // Entitlements: MLBTV_STP_ATL, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Dbacks User": "wscata+dbacks@mlb.com", // Entitlements: MLBTV_STP_ARI, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Orioles User": "wscata+orioles@mlb.com", // Entitlements: MLBTV_STP_BAL, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Angels User": "wscata+angels@mlb.com", // Entitlements: MLBTV_STP_ANA, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Red Sox User": "wscata+redsox@mlb.com", // Entitlements: MLBTV_STP_BOS, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Cubs User": "wscata+cubs@mlb.com", // Entitlements: MLBTV_STP_CHC, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Reds User": "wscata+reds@mlb.com", // Entitlements: MLBTV_STP_CIN, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Guardians User": "wscata+guardians@mlb.com", // Entitlements: MLBTV_STP_CLE, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Rockies User": "wscata+rockies@mlb.com", // Entitlements: MLBTV_STP_COL, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "White Sox User": "wscata+whitesox@mlb.com", // Entitlements: MLBTV_STP_CWS, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Tigers User": "wscata+tigers@mlb.com", // Entitlements: MLBTV_STP_DET, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Astros User": "wscata+astros@mlb.com", // Entitlements: MLBTV_STP_HOU, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Royals User": "wscata+royals@mlb.com", // Entitlements: MLBTV_STP_KC, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Dodgers User": "wscata+dodgers@mlb.com", // Entitlements: MLBTV_STP_LA, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Marlins User": "wscata+marlins@mlb.com", // Entitlements: MLBTV_STP_MIA, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Brewers User": "wscata+brewers@mlb.com", // Entitlements: MLBTV_STP_MIL, MLBAUDIO, SUBSCRIBERVOD, MiLBALL, MLBTVFOXADOBEPASS
  "Twins User": "wscata+twins@mlb.com", // Entitlements: MLBTV_STP_MIN, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Mets User": "wscata+mets@mlb.com", // Entitlements: MLBTV_STP_NYM, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Yankees User": "wscata+yankees@mlb.com", // Entitlements: MLBTV_STP_NYY, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Athletics User": "wscata+athletics@mlb.com", // Entitlements: MLBTV_STP_OAK, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Phillies User": "wscata+phillies@mlb.com", // Entitlements: MLBTV_STP_PHI, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Pirates User": "wscata+pirates@mlb.com", // Entitlements: MLBTV_STP_PIT, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Padres User": "wscata+padres@mlb.com", // Entitlements: MLBTV_STP_SD, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Mariners User": "wscata+mariners@mlb.com", // Entitlements: MLBTV_STP_SEA, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Giants User": "wscata+giants@mlb.com", // Entitlements: MLBTV_STP_SF, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Cardinals User": "wscata+cardinals@mlb.com", // Entitlements: MLBTV_STP_STL, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Rays User": "wscata+rays@mlb.com", // Entitlements: MLBTV_STP_TB, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Rangers User": "wscata+rangers@mlb.com", // Entitlements: MLBTV_STP_TEX, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Blue Jays User": "wscata+bluejays@mlb.com", // Entitlements: MLBTV_STP_TOR, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Nationals User": "wscata+nationals@mlb.com", // Entitlements: MLBTV_STP_WAS, MLBAUDIO, SUBSCRIBERVOD, MiLBALL
  "Exec User": "wscata+exec@mlb.com", // Entitlements: EXECMLB, SUBSCRIBERVOD, MiLBALL, MLBN
  "Canada User": "wscata+canada@mlb.com", // Entitlements: MLBALL, SUBSCRIBERVOD, MiLBALL | Blackout Override for IP: 100.100.100.100, ZIP: K7K 0A0, COUNTRY: CA
  "Japan User": "wscata+japan@mlb.com", // Entitlements: MLBALL, SUBSCRIBERVOD, MiLBALL | Blackout Override for IP: 100.100.100.100, ZIP: 163-8001, COUNTRY: JP
  "Yearly MVPD User": "wscata+tvmvpd@mlb.com", // Entitlements: MLBALL, SUBSCRIBERVOD, MiLBALL, MLBN, MLBTVFOXADOBEPASS, MLBTVFS1ADOBEPASS, MLBTVESPNADOBEPASS, MLBTVESPN2ADOBEPASS, MLBTVABCADOBEPASS, MLBTVTURNERADOBEPASS
  "TMobile MVPD User": "wscata+tmobilemvpd@mlb.com", // Entitlements: MLBVIDEOAR, SUBSCRIBERVOD, MLBTVFOXADOBEPASS, MLBTVFS1ADOBEPASS, MLBTVESPNADOBEPASS, MLBTVESPN2ADOBEPASS, MLBTVABCADOBEPASS, MLBTVTURNERADOBEPASS
  "Extra Innings MVPD User": "twscata+extramvpd@mlb.com", // Entitlements: MLBVIDEOADOBEPASS, SUBSCRIBERVOD, MLBTVFOXADOBEPASS, MLBTVFS1ADOBEPASS, MLBTVESPNADOBEPASS, MLBTVESPN2ADOBEPASS, MLBTVABCADOBEPASS, MLBTVTURNERADOBEPASS
  "Single Team MVPD User": "wscata+cubsmvpd@mlb.com", // Entitlements: MLBTV_STP_CHC, SUBSCRIBERVOD, MiLBALL, MLBTVFOXADOBEPASS, MLBTVFS1ADOBEPASS, MLBTVESPNADOBEPASS, MLBTVESPN2ADOBEPASS, MLBTVABCADOBEPASS, MLBTVTURNERADOBEPASS
  "International Single Team User": "wscata+frenchcubs@mlb.com", // Entitlements: MLBTV_STP_CHC, SUBSCRIBERVOD, MiLBALL | Blackout Override for IP: 100.100.100.100, ZIP: 75001, COUNTRY: FR
  "SNY IMS User": "wscata+snyims@mlb.com", // Entitlements: SNY_121, MLBAUDIO | Blackout Override for IP: 100.100.100.100, ZIP: 10010, COUNTRY: US
  "SNLA IMS User": "wscata+snlaims@mlb.com", // Entitlements: SNLA_119, MLBAUDIO, SUBSCRIBERVOD | Blackout Override for IP: 100.100.100.100, ZIP: 90009, COUNTRY: US
  "MASN IMS User": "wscata+masnims@mlb.com", // Entitlements: MASN_110, MLBAUDIO | Blackout Override for IP: 100.100.100.100, ZIP: 21201, COUNTRY: US
  "RSN User": "wscata+rsn@mlb.com", // Entitlements: SNY_121, SNLA_119, NBC_133, NBC_137, NBC_143, MASN_110, MASN_120, MLBAUDIO
  "RSN MVPD User": "wscata+rsnmvpd@mlb.com", // Entitlements: SNY_121, SNLA_119, NBC_133, NBC_137, NBC_143, MASN_110, MASN_120, MLBAUDIO, MLBTVFOXADOBEPASS, MLBTVFS1ADOBEPASS, MLBTVESPNADOBEPASS, MLBTVESPN2ADOBEPASS, MLBTVABCADOBEPASS, MLBTVTURNERADOBEPASS
  Password: "W@tch-1t-g0",
};

const devTestUsers = {
  ...qaTestUsers,
};

module.exports = {
  qaTestUsers,
  devTestUsers,
};
