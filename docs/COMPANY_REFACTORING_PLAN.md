# Final Company Name Refactoring Plan

This document serves as the absolute and final plan for refactoring company names during the LinkedIn synchronization process. It consolidates the strategy from `Final-Plan.txt`, AI suggestions, and subsequent refinements.

## 1. Core Formatting Rules (Phase 1)

All company names will first undergo standard cleaning and PascalCase formatting (e.g., "Applied Materials" -> "AppliedMaterials"). After this formatting, the `refactorCompanyName` function will apply the following logic:

### 1.1 Global Noise Removal

Strip these terms from the end of the name (case-insensitive):

- `Ltd`, `Limited`, `Inc`, `LLC`, `Corp`, `Co`, `Holdings`, `Group`, `Technologies`, `Systems`, `Solutions`, `R&D`, `International`.
- `Israel` (Only when it is the final word, e.g., `AppliedMaterialsIsrael` -> `AppliedMaterials`).
- `A` (Specifically when part of acquisition markers like "A Salesforce Company").

### 1.2 Character & Acquisition Handling

- **Special Characters**: `&` -> `And`, `é` -> `e` (e.g., `Nestlé` -> `Nestle`).
- **Acquisitions**: Handle markers like `ASalesforce`, `by`, `a`, `@`, `via`.
  - Specifically: Split on `ASalesforce` or regex `A\s+Salesforce`.
- **Legacy Names**: Truncate everything from `Formerly` onwards.

### 1.3 Brand-Essential Suffixes (Protected List)

Do NOT strip these suffixes when they are part of the brand:

- `.com`, `.ai`, `.io`, `.fm`, `J.P.`, `AT&T`, `eBay`, `SVT.Jobs`, `GlassesUSA.com`.

## 2. Global Rule-Based Normalization (Phase 2)

Apply these logic rules before checking the manual mapping list:

- **Stealth**: If name contains `Stealth` (case-insensitive) -> `Stealth`.
- **Freelance**: If name contains `Freelance`, `Independent`, `SelfEmployed`, or `Self` -> `Freelance`.
- **IDF/Security**:
  - If name matches `Unit\s?\d{3,4}` (e.g., Unit 8200) -> `IDF`.
  - If name contains `IDF`, `IsraelDefense`, `IsraeliMilitary`, `IsraeliArmy`, `IsraeliNavy`, `IsraeliAirForce`, `Mamram`, or `Lotem` -> `IDF`.

## 3. Manual Refactor List (Phase 3)

_Note: Comparisons are case-insensitive. Keys ignore internal whitespace._

| Cleaned Name (Input)                     | Refactored Name (Output) |
| :--------------------------------------- | :----------------------- |
| YouCCTechnologies                        | YouCC                    |
| RafaelAdvanced                           | Rafael                   |
| RafaelAdvancedDefenseSystems             | Rafael                   |
| StraussGroup / StraussWater              | Strauss                  |
| Monday                                   | Monday.com               |
| SodaStreamInternational                  | SodaStream               |
| Jobtime.israel                           | Jobtime                  |
| InfinityLabsR&D                          | InfinityLabs             |
| DecathlonIsrael / International          | Decathlon                |
| Wix.com                                  | Wix                      |
| AllJobs'                                 | AllJobs                  |
| DatoramaASalesforce                      | Datorama                 |
| ExperisIsrael                            | Experis                  |
| OSRR&D / Enterprises                     | OSR                      |
| MorningByGreen                           | Morning                  |
| Www.leonid.co.il                         | Leonid                   |
| AmazonWeb / AWS                          | Amazon                   |
| DemocratechIsrael                        | Democratech              |
| HarelFinance / Insurance                 | Harel                    |
| PhoenixFinancial / Investment / Holdings | Phoenix                  |
| MigdalGroup / Capital                    | Migdal                   |
| Manpower (All variations)                | Manpower                 |
| TidharGroup                              | Tidhar                   |
| NishaGroup                               | Nisha                    |
| IPcom.co.il                              | IPcom                    |
| Viz                                      | Viz.ai                   |
| SolarEdgeTechnologies                    | SolarEdge                |
| GlassesUSA                               | GlassesUSA.com           |
| GOLFGROUP                                | GolfGroup                |
| HMS / Hms                                | HMS                      |
| MercantileDiscount / Discount Bank       | DiscountBank             |
| AgoraRE                                  | Agora                    |
| DentsuIsrael                             | Dentsu                   |
| PartnerIsrael                            | Partner                  |
| HackerUThriveDX                          | ThriveDX                 |
| DellTechnologies                         | Dell                     |
| MatrixR&D                                | Matrix                   |
| QualitestIsrael                          | Qualitest                |
| EToro                                    | eToro                    |
| AbraR&D / Devalore                       | Abra                     |
| NestléNespresso                          | Nestlé                   |
| NetafimIsrael                            | Netafim                  |
| IntuitiveIsrael                          | Intuitive                |
| PapayaGlobal / PAGAYA / Pagaya           | Papaya                   |
| Shift4Europe                             | Shift4                   |
| SVTJobs / Svt.jobsRecruitment            | SVT.Jobs                 |
| TomerAGovernment                         | Tomer                    |
| Mend                                     | Mend.io                  |
| AkamaiTechnologies                       | Akamai                   |
| Anyclip.com                              | Anyclip                  |
| COMBLACK                                 | Comblack                 |
| EBay                                     | eBay                     |
| RemitlyIsrael                            | Remitly                  |
| BUYMETechnologies                        | BUYME                    |
| TevaPharmaceuticals                      | Teva                     |
| MALAM / MalamTeam                        | MalamTeam                |
| ZIMIntegrated                            | ZIM                      |
| Riverside                                | Riverside.fm             |
| REEAutomotive                            | REE                      |
| MaofMe / HR / Group                      | Maof                     |
| ShebaTel                                 | ShebaMedical             |
| PwCIsrael                                | PwC                      |
| KPMGIsrael                               | KPMG                     |
| SQLinkGroup                              | SQLink                   |
| AT&TIsrael                               | AT&T                     |
| CybereasonALevelBlue                     | Cybereason               |
| HH+ByIlan                                | HH+                      |
| J.P / J.P. Morgan                        | J.P. Morgan              |
| EShop                                    | eShop                    |
| NICE / NiceLtd / NICEActimize            | NICE                     |
| EricssonGlobal                           | Ericsson                 |
| TheCenter                                | CET                      |
| CompieTechnologies / Pro                 | Compie                   |
| InvencoByGVR                             | Invenco                  |
| CalIsrael / Cal                          | Cal                      |
| CheckPointSoftware                       | CheckPoint               |
| IaiIsraelAerospaceIndustries             | IAI                      |
| ElAlIsraelAirlines                       | ElAl                     |
| IecIsraelElectricCorporation             | IEC                      |
| ClalitHealthServices                     | Clalit                   |
| MaccabiHealthCareServices                | Maccabi                  |
| BankHapoalim                             | BankHapoalim             |
| BankLeumi                                | BankLeumi                |
| IntelCorporation / Israel                | Intel                    |
| IclGroup                                 | ICL                      |
| BdoIsrael                                | BDO                      |
| MenoraMivtachimGroup                     | Menora                   |
| HewlettPackardEnterprise                 | HPE                      |
| NessTechnologies                         | Ness                     |
| CyberArkSoftware                         | CyberArk                 |
| AmdocsIsrael                             | Amdocs                   |
| NvidiaIsrael                             | NVIDIA                   |
| MetaIsrael                               | Meta                     |
| GoogleIsrael                             | Google                   |
| MicrosoftIsrael / R&D                    | Microsoft                |
| AccentureArgentina                       | Accenture                |
| AppliedMaterialsIsrael                   | AppliedMaterials         |
| PaloAltoNetworks                         | PaloAlto                 |
| SamsungResearchIsrael                    | Samsung                  |
| TelAvivUniversity                        | TAU                      |
| BenGurionUniversity                      | BGU                      |
| Isracard                                 | Isracard                 |
| LeumitHealthServices                     | Leumit                   |
| Meuhedet                                 | Meuhedet                 |
| IsraelRailways                           | IsraelRailways           |
| IsraelPolice                             | IsraelPolice             |
| MinistryOfHealth                         | MOH                      |
| JFrog                                    | JFrog                    |
| HOT / HOTmobile                          | HOT                      |
| Cellcom                                  | Cellcom                  |
| Bezeq                                    | Bezeq                    |
| Shufersal                                | Shufersal                |
| Osem / OsemNestle                        | Osem                     |
| Tempo / TempoBeverages                   | Tempo                    |
| BankMizrahiTefahot                       | BankMizrahiTefahot       |
| BankOtsarHaHayal                         | BankOtsarHaHayal         |
| BankOfIsrael                             | BankOfIsrael             |
| Payoneer                                 | Payoneer                 |
| Playtika                                 | Playtika                 |
| Taboola                                  | Taboola                  |
| WalkMe                                   | WalkMe                   |
| Zerto                                    | Zerto                    |
| Similarweb                               | Similarweb               |

## 4. Structural Implementation

Instead of simple string replacement, we will use a structure that allows for future expansion:

```typescript
type Company = {
  normalized: string; // The brand name for display
  original: string; // The source name from LinkedIn
};
```

This ensures we keep the "Short Name" for the Company field and labels while maintaining the full context if needed.
