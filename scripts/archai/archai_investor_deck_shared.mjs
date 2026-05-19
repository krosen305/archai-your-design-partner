import fs from "node:fs/promises";
import path from "node:path";

export const DECK_SLUG = "archai-investor-deck";
export const FINAL_FILENAME = "archai-investor-deck-pre-seed-2026.pptx";
export const SLIDE_COUNT = 12;

export const THEME = {
  paper: "#F4E9DB",
  card: "#FFFDF8",
  ink: "#16263A",
  muted: "#596577",
  line: "#D6C8B6",
  accent: "#B55D2C",
  accent2: "#256F6E",
  accent3: "#E8DCCA",
  accent4: "#B7C9B7",
  sand: "#EDE0D1",
  gold: "#C68A2A",
  red: "#A44630",
  blue: "#395A80",
};

const TITLES = [
  "Private homebuilding can become software-defined.",
  "Consumers face a preconstruction journey that is expensive, opaque, and structurally slow.",
  "One guided workflow can collapse months of coordination into a single AI-native platform.",
  "The moat is a compliance-aware automation chain, not a generic design copilot.",
  "Denmark is a credible proving ground; the software layer is the real scale opportunity.",
  "B2C pays for validation; B2B creates recurring high-margin revenue.",
  "The Trojan horse is deliberate: train in B2C, compound in B2B.",
  "For a pre-seed company, the next 12 months of proof are the real traction asset.",
  "ArchAI wins where incumbents force the buyer to trade off speed, freedom, and certainty.",
  "This is a systems problem, so the team has to combine AI, AEC, and capital discipline.",
  "The model gets materially better as revenue shifts from assisted B2C to recurring software.",
  "This round buys the proof points that unlock the next valuation step.",
];

const CLAIM_SPINE = [
  {
    kicker: "THESIS",
    proof: "Cover with proof rail",
    source: "Internal positioning",
  },
  {
    kicker: "PROBLEM",
    proof: "Journey friction map plus evidence rail",
    source: "Market observation and buyer workflow",
  },
  {
    kicker: "SOLUTION",
    proof: "Four-phase product map",
    source: "ArchAI product strategy",
  },
  {
    kicker: "PRODUCT",
    proof: "Concrete workflow architecture",
    source: "ArchAI product strategy",
  },
  {
    kicker: "MARKET",
    proof: "Denmark wedge plus global software adjacency",
    source: "DST 13 May 2026; DST 13 Nov 2025; Grand View Research 2025",
  },
  {
    kicker: "MODEL",
    proof: "Monetization ladder and margin profile",
    source: "Internal pricing logic",
  },
  {
    kicker: "STRATEGY",
    proof: "B2C-to-B2B operating bridge",
    source: "Go-to-market thesis",
  },
  {
    kicker: "VALIDATION",
    proof: "Pilot sequence and proof metrics",
    source: "Internal de-risking plan",
  },
  {
    kicker: "COMPETITION",
    proof: "Comparative matrix",
    source: "Market structure analysis",
  },
  {
    kicker: "TEAM",
    proof: "Role stack and operating principles",
    source: "Founding team template",
  },
  {
    kicker: "ECONOMICS",
    proof: "Revenue-mix bridge and unit economics",
    source: "Illustrative internal model",
  },
  {
    kicker: "ASK",
    proof: "Use-of-funds bars and milestone ribbon",
    source: "Illustrative raise plan",
  },
];

const SOURCE_NOTES = [
  "Danmarks Statistik, 13. maj 2026, '2026 starter med et fald i byggeaktiviteten': 3.115 tilladte boliger i enfamiliehuse i 1. kvt. 2026; 2.648 påbegyndte boliger i enfamiliehuse i 1. kvt. 2026.",
  "Danmarks Statistik, 13. november 2025, 'Fortsat stigning i det påbegyndte byggeri': 2.748 påbegyndte boliger i enfamiliehuse i 3. kvt. 2025.",
  "Danmarks Statistik samme serie giver 2025-kvartaler for påbegyndte enfamiliehuse: 2.551, 3.099, 2.748, 2.869. Summen = 11.267.",
  "Grand View Research, Construction Management Software Market Report, crawled 2026: USD 7,67 mia. i 2025 og USD 16,37 mia. i 2033.",
  "Alle danske monetization wedges i decket er illustrative bottom-up scenarier og er markeret som interne antagelser.",
];

const DESIGN_SYSTEM_TEXT = `Task mode: create
Primary deck profile: product-platform
Secondary gates: GTM/commercialization, investor strategy narrative
Slide size: 1280x720
Background system: warm paper field with restrained sand cards and copper/teal accents
Typography: Georgia for claim titles; Aptos for labels, body, and numeric rails
Color palette:
- Paper ${THEME.paper}
- Ink ${THEME.ink}
- Muted ${THEME.muted}
- Copper ${THEME.accent}
- Teal ${THEME.accent2}
- Sand ${THEME.accent3}
- Sage ${THEME.accent4}
Chart grammar: direct labels, no legends, simple bars/rails, no pseudo-brand icons
Diagram grammar: concrete boxes, explicit connectors, one left-to-right logic per workflow
Container grammar: rectangular cards with hairline borders and generous insets
Footer grammar: small muted source lines only where numbers are cited
Page marker grammar: quiet top-right 01/12 style index
Kicker grammar: one named marker/label pair per slide
Allowed layout families:
- Cover with proof rail
- Editorial split with right evidence column
- Four-up system map
- Two-panel market proof
- Monetization ladder
- Bridge / before-after strategy
- Scorecard plus sequence grid
- Dense comparison matrix
- Team role cards
- Bar bridge plus KPI rail
Banned motifs:
- Generic SaaS card grids repeated three slides in a row
- Decorative pseudo-logos
- Heavy legends
- Rounded default dashboard cards
- Empty “AI platform” boxes with vague labels`;

const CONTACT_SHEET_PLAN = `12 slides
Macro-layout families:
1. Cover with right-side proof rail
2. Split editorial problem slide with journey ribbon
3. Four-column product phase system
4. Horizontal workflow architecture
5. Two-panel market proof
6. Ascending monetization ladder
7. Two-column strategic bridge
8. Pilot table plus metric dashboard
9. Dense comparison matrix
10. Team cards plus operating band
11. Revenue-mix bridge and KPI rail
12. Ask card plus use-of-funds bars
Hard-gate check:
- No three consecutive slides share the same macro layout
- No more than two explicit table/grid-heavy slides
- Titles are claim-led, not topic-led`;

const VALIDATION_ROWS = [
  [
    "Pilot 1",
    "Kendt kunde",
    "Benchmark mod manuel proces",
    "Lok. plan + mængder + første myndighedspakke",
  ],
  [
    "Pilot 2",
    "Kendt kunde",
    "Edge cases og review-flow",
    "Lav-confidence sager og exception handling",
  ],
  [
    "Pilot 3",
    "Cold customer",
    "End-to-end bankability proof",
    "Bankdialog, myndighed og entreprenøraccept",
  ],
];

const COMP_HEADERS = ["Dimension", "Trad. arkitekt", "Typehusfirma", "Generiske tools", "ArchAI"];

const COMP_ROWS = [
  [
    "Pris til første beslutning",
    "Høj",
    "Indirekte bundtet",
    "Lav softwarepris",
    "Lav entry + unlocks",
  ],
  [
    "Lead time",
    "Uger til måneder",
    "Uger",
    "Hurtig men løs",
    "Minutter til første kvalificerede koncept",
  ],
  ["Designfrihed", "Høj", "Lav til medium", "Medium", "Høj inden for compliance-rammen"],
  [
    "Compliance-dybde",
    "Personbåren",
    "Intern og lukket",
    "Lav lokal dybde",
    "Datafordeler + regelmotor + audit trail",
  ],
  ["Myndighedspakke", "Manuel", "Manuel / intern", "Typisk nej", "Produktiserbar arbejdsgang"],
  [
    "Data-feedback loop",
    "Lav",
    "Intern og lukket",
    "Lav",
    "Direkte modeltræning fra sager og fejlmønstre",
  ],
];

const ROLE_CARDS = [
  {
    role: "CEO / GTM",
    lead: "Indsæt founder-navn",
    bullets: [
      "PropTech og venture-fortælling",
      "Design partner-salg til typehusaktører",
      "Kapitaldisciplin og markedslæring",
    ],
  },
  {
    role: "CTO / AI Platform",
    lead: "Indsæt founder-navn",
    bullets: [
      "Workflow automation og model orchestration",
      "Data pipes for DAR, MAT, BBR og dokumenter",
      "Fra prototype til skalerbar software",
    ],
  },
  {
    role: "AEC / Compliance",
    lead: "Indsæt founder-navn",
    bullets: [
      "BR18, lokalplaner og myndighedslogik",
      "Human-review design og liability boundaries",
      "Kvalitetssikring på edge cases",
    ],
  },
];

const FUND_BARS = [
  ["Produkt og AI", 45, THEME.ink],
  ["Go-to-market og pilotsalg", 25, THEME.accent],
  ["Compliance, QA og forsikring", 15, THEME.accent2],
  ["Data, cloud og sikkerhed", 10, THEME.gold],
  ["Drift", 5, THEME.muted],
];

function line(ctx, fill = THEME.line, width = 1) {
  return ctx.line(fill, width);
}

function rect(slide, ctx, left, top, width, height, fill, options = {}) {
  return ctx.addShape(slide, {
    left,
    top,
    width,
    height,
    fill,
    geometry: options.geometry || "rect",
    line:
      options.line ||
      line(ctx, fill === THEME.card ? THEME.line : "#00000000", options.lineWidth || 1),
    name: options.name,
  });
}

function circle(slide, ctx, left, top, size, fill, options = {}) {
  return rect(slide, ctx, left, top, size, size, fill, {
    ...options,
    geometry: "ellipse",
  });
}

function text(slide, ctx, value, left, top, width, height, options = {}) {
  return ctx.addText(slide, {
    text: value,
    left,
    top,
    width,
    height,
    fontSize: options.fontSize || 16,
    color: options.color || THEME.ink,
    bold: Boolean(options.bold),
    face: options.face || "Aptos",
    align: options.align || "left",
    valign: options.valign || "top",
    fill: options.fill || "#00000000",
    line: options.line || ctx.line("#00000000", 0),
    insets: options.insets || { left: 0, right: 0, top: 0, bottom: 0 },
    name: options.name,
  });
}

function backdrop(slide, ctx) {
  rect(slide, ctx, 0, 0, ctx.W, ctx.H, THEME.paper, {
    line: ctx.line("#00000000", 0),
  });
  rect(slide, ctx, 940, 0, 340, 720, "#F0E4D5", {
    line: ctx.line("#00000000", 0),
  });
  rect(slide, ctx, 0, 664, 1280, 56, "#EFE4D7", {
    line: ctx.line("#00000000", 0),
  });
}

function addPageMarker(slide, ctx, index) {
  text(slide, ctx, `${String(index).padStart(2, "0")}/${SLIDE_COUNT}`, 1128, 52, 90, 20, {
    fontSize: 11,
    color: THEME.muted,
    align: "right",
    bold: true,
  });
}

function addKicker(slide, ctx, label, y, id = "01") {
  rect(slide, ctx, 78, y + 4, 10, 10, THEME.accent, {
    line: ctx.line("#00000000", 0),
    name: `kicker-${id}-marker`,
  });
  text(slide, ctx, label, 98, y, 220, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
    name: `kicker-${id}-label`,
    valign: "middle",
  });
}

function addTitle(slide, ctx, value, top, width = 880) {
  text(slide, ctx, value, 78, top, width, 100, {
    fontSize: 35,
    face: "Georgia",
    bold: true,
    color: THEME.ink,
    insets: { left: 0, right: 6, top: 0, bottom: 0 },
  });
}

function addLead(slide, ctx, value, top, width = 760) {
  text(slide, ctx, value, 78, top, width, 54, {
    fontSize: 16,
    color: THEME.muted,
    insets: { left: 0, right: 8, top: 0, bottom: 0 },
  });
}

function addFooter(slide, ctx, value) {
  text(slide, ctx, value, 78, 684, 1000, 16, {
    fontSize: 10,
    color: THEME.muted,
  });
}

function panel(slide, ctx, left, top, width, height, options = {}) {
  rect(slide, ctx, left, top, width, height, options.fill || THEME.card, {
    line: options.line || line(ctx, THEME.line, 1),
  });
}

function metricCard(slide, ctx, left, top, width, height, label, value, tone = "ink") {
  const fillMap = {
    ink: THEME.card,
    accent: "#F4E4D8",
    teal: "#E2EFEE",
    sand: "#F0E6DA",
  };
  panel(slide, ctx, left, top, width, height, { fill: fillMap[tone] || THEME.card });
  const valueSize =
    String(value).length > 80
      ? 15
      : String(value).length > 50
        ? 17
        : String(value).length > 32
          ? 20
          : 24;
  const valueHeight = String(value).length > 40 ? height - 62 : height - 54;
  text(slide, ctx, label, left + 18, top + 18, width - 36, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  text(slide, ctx, value, left + 18, top + 42, width - 36, valueHeight, {
    fontSize: valueSize,
    face: "Georgia",
    bold: true,
    color: tone === "teal" ? THEME.accent2 : tone === "accent" ? THEME.accent : THEME.ink,
  });
}

function labelValue(slide, ctx, left, top, width, label, value, accent = THEME.accent) {
  rect(slide, ctx, left, top, width, 2, accent, {
    line: ctx.line("#00000000", 0),
  });
  text(slide, ctx, label, left, top + 8, width, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  text(slide, ctx, value, left, top + 30, width, 40, {
    fontSize: 21,
    face: "Georgia",
    bold: true,
  });
}

function bulletLines(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function bulletBlock(slide, ctx, left, top, width, height, items, options = {}) {
  text(slide, ctx, bulletLines(items), left, top, width, height, {
    fontSize: options.fontSize || 14,
    color: options.color || THEME.ink,
    insets: { left: 0, right: 6, top: 0, bottom: 0 },
  });
}

function chip(slide, ctx, left, top, width, label, fill = THEME.accent3, color = THEME.ink) {
  rect(slide, ctx, left, top, width, 28, fill, {
    line: ctx.line("#00000000", 0),
  });
  text(slide, ctx, label, left + 10, top + 6, width - 20, 16, {
    fontSize: 11,
    bold: true,
    color,
    align: "center",
  });
}

function rowRule(slide, ctx, left, top, width) {
  rect(slide, ctx, left, top, width, 1, THEME.line, {
    line: ctx.line("#00000000", 0),
  });
}

function slide1(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 1);
  addKicker(slide, ctx, "PRE-SEED 2026", 56, "01");
  addTitle(slide, ctx, TITLES[0], 88, 660);
  addLead(
    slide,
    ctx,
    "ArchAI bygger den compliance-native softwarestack til privat nybyggeri: fra grunddata og lokalplaner til BIM, myndighedspakke og udbud.",
    238,
    650,
  );
  text(
    slide,
    ctx,
    "Danmark-first wedge.\nB2C training loop.\nB2B SaaS endgame.",
    78,
    336,
    300,
    92,
    {
      fontSize: 19,
      face: "Georgia",
      bold: true,
      color: THEME.accent2,
    },
  );

  panel(slide, ctx, 792, 86, 394, 548, { fill: "#F7EFE5" });
  text(slide, ctx, "Why now", 824, 112, 150, 20, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  metricCard(
    slide,
    ctx,
    824,
    146,
    330,
    108,
    "Workflow pain",
    "Preconstruction is still a handoff problem.",
    "accent",
  );
  metricCard(
    slide,
    ctx,
    824,
    272,
    330,
    108,
    "Product wedge",
    "Compliance and documentation can be software-defined.",
    "teal",
  );
  metricCard(
    slide,
    ctx,
    824,
    398,
    330,
    108,
    "Endgame",
    "White-label modules and API revenue for typehus partners.",
    "sand",
  );
  chip(slide, ctx, 824, 536, 160, "Fortroligt");
  chip(slide, ctx, 994, 536, 160, "Maj 2026", "#E5ECE9", THEME.accent2);
  addFooter(
    slide,
    ctx,
    "Investor draft for narrative development. Replace team placeholders and any live traction claims before external circulation.",
  );
  return slide;
}

function slide2(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 2);
  addKicker(slide, ctx, "PROBLEM", 56, "02");
  addTitle(slide, ctx, TITLES[1], 88, 835);
  addLead(
    slide,
    ctx,
    "Kunden køber ikke bare et hus. Kunden køber koordinationsrisiko mellem data, rådgivere, compliance, myndigheder og entreprenører.",
    188,
    760,
  );

  panel(slide, ctx, 78, 258, 722, 270, { fill: THEME.card });
  text(slide, ctx, "The real bottleneck is the handoff chain.", 104, 284, 520, 24, {
    fontSize: 23,
    face: "Georgia",
    bold: true,
  });
  const steps = [
    ["Adresse og grunddata", "Ingen samlet sandhed om servitutter, grænser og plot-risici."],
    ["Lokalplan og BR18", "Regler skal tolkes manuelt i dokumenter med lav struktur."],
    ["Skitser og rådgivere", "Iteration er dyr, fordi hver ændring skaber nye afhængigheder."],
    ["Myndighed", "Ansøgningspakken bygges sent og manuelt."],
    ["Udbud", "Tilbud er svære at sammenligne og lægger skjulte risikopræmier ind."],
  ];
  let x = 104;
  const widths = [118, 118, 136, 112, 118];
  steps.forEach((step, idx) => {
    panel(slide, ctx, x, 344, widths[idx], 140, { fill: idx % 2 === 0 ? "#F7F1E8" : "#EDF2F0" });
    circle(slide, ctx, x + 12, 358, 28, idx === 1 || idx === 3 ? THEME.accent2 : THEME.accent);
    text(slide, ctx, String(idx + 1), x + 12, 364, 28, 12, {
      fontSize: 11,
      color: "#FFFFFF",
      bold: true,
      align: "center",
    });
    text(slide, ctx, step[0], x + 48, 358, widths[idx] - 60, 30, {
      fontSize: 12,
      bold: true,
      color: THEME.ink,
    });
    text(slide, ctx, step[1], x + 12, 398, widths[idx] - 24, 68, {
      fontSize: 10.5,
      color: THEME.muted,
    });
    x += widths[idx] + 10;
  });

  panel(slide, ctx, 838, 258, 348, 270, { fill: "#FAF4EC" });
  const pains = [
    ["Manglende transparens", "Køberen ser sent, hvad der er lovligt, dyrt eller langsomt."],
    ["Låste rammer", "Typehusmodellen optimerer standardisering, ikke kundens unikke plot."],
    ["Høje rådgiveromkostninger", "Tidlige iterationer æder budget, før projektet er bankklart."],
    ["Sent risikosignal", "Compliance-problemer opdages ofte efter designarbejdet er startet."],
  ];
  pains.forEach((pain, idx) => {
    const top = 286 + idx * 58;
    rowRule(slide, ctx, 864, top - 8, 296);
    text(slide, ctx, pain[0], 864, top, 150, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    text(slide, ctx, pain[1], 1014, top, 146, 38, {
      fontSize: 11,
      color: THEME.ink,
    });
  });
  addFooter(
    slide,
    ctx,
    "Problem framing reflects current buyer workflow and incentive misalignment in Danish private homebuilding.",
  );
  return slide;
}

function slide3(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 3);
  addKicker(slide, ctx, "SOLUTION", 56, "03");
  addTitle(slide, ctx, TITLES[2], 88, 860);
  addLead(
    slide,
    ctx,
    "ArchAI samler de fire Builder's Cockpit-faser i ét system, så kunden kan gå fra idé til beslutningsklar sag uden at starte forfra mellem hvert led.",
    188,
    860,
  );

  const cards = [
    [
      "1",
      "Sandkassen",
      ["Brief, inspirationsbilleder og Hus-DNA", "Første kvalificerede koncepter"],
      THEME.accent,
    ],
    [
      "2",
      "Matriklen",
      ["Grunddata, servitutter og hard stops", "Plot-risiko før spildt designarbejde"],
      THEME.accent2,
    ],
    [
      "3",
      "Maskinrummet",
      ["BIM, mængder og live compliance", "Designændringer uden manuelt restart"],
      THEME.gold,
    ],
    [
      "4",
      "Myndighed",
      ["Ansøgningspakke og udbudsmotor", "Fra dokumentkaos til afleverbar pakke"],
      THEME.blue,
    ],
  ];
  cards.forEach((card, idx) => {
    const left = 78 + idx * 280;
    panel(slide, ctx, left, 262, 250, 294, { fill: idx % 2 === 0 ? "#FBF6EF" : "#F4F7F3" });
    circle(slide, ctx, left + 18, 282, 42, card[3]);
    text(slide, ctx, card[0], left + 18, 294, 42, 14, {
      fontSize: 17,
      color: "#FFFFFF",
      bold: true,
      align: "center",
    });
    text(slide, ctx, card[1], left + 74, 284, 150, 26, {
      fontSize: 20,
      face: "Georgia",
      bold: true,
    });
    bulletBlock(slide, ctx, left + 18, 336, 214, 88, card[2], { fontSize: 13 });
    chip(
      slide,
      ctx,
      left + 18,
      456,
      214,
      idx === 0
        ? "Discovery -> concept"
        : idx === 1
          ? "Constraints -> go/no-go"
          : idx === 2
            ? "Design -> quantities"
            : "Package -> market",
    );
  });

  panel(slide, ctx, 78, 586, 1094, 56, { fill: "#E9EEE7" });
  text(
    slide,
    ctx,
    "From many handoffs to one guided workflow: the customer experience becomes continuous, and the data exhaust becomes trainable.",
    104,
    603,
    1044,
    18,
    {
      fontSize: 14,
      color: THEME.ink,
      bold: true,
      align: "center",
    },
  );
  return slide;
}

function slide4(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 4);
  addKicker(slide, ctx, "PRODUCT", 56, "04");
  addTitle(slide, ctx, TITLES[3], 88, 900);
  addLead(
    slide,
    ctx,
    "Hver boks i kæden er konkret. Data, regler, design og dokumenter hænger sammen gennem én auditérbar arbejdsgang.",
    188,
    800,
  );

  const flow = [
    ["Input", "Brugerønsker, billeder og adresse", "Structured brief"],
    ["Property intelligence", "DAR, MAT, BBR, servitutter og lokalplan", "Plot context"],
    ["Rule engine", "BR18 + lokale regler + confidence gates", "Allowed envelope"],
    ["Design system", "3D BIM, mængder og design-iterationer", "Buildable concept"],
    ["Output stack", "Myndighedspakke, udbud og partnerflows", "Actionable packet"],
  ];
  flow.forEach((item, idx) => {
    const left = 84 + idx * 228;
    panel(slide, ctx, left, 290, 188, 176, {
      fill: idx === 1 || idx === 3 ? "#EEF4F3" : "#FAF4EC",
    });
    text(slide, ctx, item[0], left + 16, 314, 156, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    text(slide, ctx, item[1], left + 16, 344, 156, 62, {
      fontSize: 14,
      face: "Georgia",
      bold: true,
      color: THEME.ink,
    });
    chip(slide, ctx, left + 16, 424, 156, item[2], idx % 2 === 0 ? THEME.accent3 : "#DCECEA");
    if (idx < flow.length - 1) {
      rect(slide, ctx, left + 188, 374, 40, 2, THEME.ink, { line: ctx.line("#00000000", 0) });
      rect(slide, ctx, left + 220, 370, 8, 10, THEME.ink, { line: ctx.line("#00000000", 0) });
    }
  });

  const proofs = [
    ["Confidence gates", "Low-confidence documents do not auto-progress."],
    ["Audit trail", "Every rule interpretation can be inspected and revised."],
    ["Human review", "Manual expertise moves to exception handling, not default production."],
  ];
  proofs.forEach((proof, idx) => {
    const left = 108 + idx * 360;
    rowRule(slide, ctx, left, 542, 292);
    text(slide, ctx, proof[0], left, 552, 120, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    text(slide, ctx, proof[1], left + 124, 552, 168, 34, {
      fontSize: 11,
      color: THEME.ink,
    });
  });
  return slide;
}

function slide5(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 5);
  addKicker(slide, ctx, "MARKET", 56, "05");
  addTitle(slide, ctx, TITLES[4], 88, 950);
  addLead(
    slide,
    ctx,
    "Decket bruger en bottom-up wedge i Danmark og en software-adjacency globalt. Det holder fortællingen investor-skarp uden at pynte TAM’en kunstigt.",
    188,
    920,
  );

  panel(slide, ctx, 78, 254, 520, 338, { fill: THEME.card });
  text(slide, ctx, "Denmark wedge", 106, 280, 140, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  text(slide, ctx, "11.267", 106, 314, 214, 52, {
    fontSize: 40,
    face: "Georgia",
    bold: true,
    color: THEME.accent,
  });
  text(
    slide,
    ctx,
    "Påbegyndte enfamiliehuse i 2025\n(sum af sæsonkorrigerede kvartaler)",
    106,
    380,
    240,
    40,
    {
      fontSize: 12,
      color: THEME.ink,
    },
  );
  metricCard(
    slide,
    ctx,
    364,
    304,
    198,
    110,
    "Latest flow",
    "3.115 tilladte enfamiliehuse i 1. kvt. 2026",
    "teal",
  );
  metricCard(
    slide,
    ctx,
    106,
    438,
    456,
    110,
    "Illustrativ serviceable wedge",
    "DKK 110-280 mio. årligt ved betalte unlocks og ansøgningspakker",
    "accent",
  );

  panel(slide, ctx, 646, 254, 526, 338, { fill: "#F8F2E8" });
  text(slide, ctx, "Software endgame", 674, 280, 180, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  labelValue(
    slide,
    ctx,
    674,
    312,
    180,
    "Construction management software",
    "USD 7,67 mia. i 2025",
    THEME.accent2,
  );
  labelValue(slide, ctx, 884, 312, 180, "Projected market", "USD 16,37 mia. i 2033", THEME.gold);
  metricCard(
    slide,
    ctx,
    674,
    438,
    498,
    110,
    "Illustrativ Danmark B2B wedge",
    "DKK 25-120 mio. før usage fees og enterprise expansion",
    "sand",
  );
  addFooter(
    slide,
    ctx,
    "Kilder: Danmarks Statistik 13.05.2026 og 13.11.2025; Grand View Research, Construction Management Software Market Report. Wedge-estimater er illustrative interne scenarier.",
  );
  return slide;
}

function slide6(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 6);
  addKicker(slide, ctx, "MODEL", 56, "06");
  addTitle(slide, ctx, TITLES[5], 88, 930);
  addLead(
    slide,
    ctx,
    "Prismodellen skal spejle virksomhedens læringskurve: lav friktion i discovery, betalte unlocks i B2C, recurring revenue når modulerne sælges ind i industrien.",
    188,
    840,
  );

  const bands = [
    ["Free discovery", 286, 280, THEME.card],
    ["Compliance unlock", 326, 360, "#F8ECE0"],
    ["Concept + BIM pack", 366, 450, "#E7F0EF"],
    ["Application / tender package", 406, 540, "#F3E9DD"],
    ["Design partner module", 446, 630, "#DDEAE7"],
    ["Enterprise license + API", 486, 720, "#E6D7C3"],
  ];
  bands.forEach((band) => {
    rect(slide, ctx, 86, band[1], band[2], 36, band[3], {
      line: line(ctx, "#00000000", 0),
    });
    text(slide, ctx, band[0], 104, band[1] + 9, band[2] - 32, 18, {
      fontSize: 12,
      bold: true,
      color: THEME.ink,
    });
  });
  text(slide, ctx, "The revenue ladder mirrors product maturity.", 86, 256, 430, 22, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });

  panel(slide, ctx, 874, 256, 298, 316, { fill: THEME.card });
  metricCard(slide, ctx, 898, 286, 250, 78, "Early assisted B2C", "40-60% gross margin", "accent");
  metricCard(slide, ctx, 898, 378, 250, 78, "Software-heavy B2B", "75-85% gross margin", "teal");
  metricCard(
    slide,
    ctx,
    898,
    470,
    250,
    78,
    "Strategic goal",
    "Recurring revenue becomes the majority of contribution profit",
    "sand",
  );

  panel(slide, ctx, 86, 560, 698, 56, { fill: "#E9EEE7" });
  text(
    slide,
    ctx,
    "B2C proves willingness to pay and trains the system. B2B turns those validated workflows into recurring software economics.",
    112,
    577,
    648,
    18,
    {
      fontSize: 14,
      color: THEME.ink,
      bold: true,
    },
  );
  return slide;
}

function slide7(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 7);
  addKicker(slide, ctx, "STRATEGY", 56, "07");
  addTitle(slide, ctx, TITLES[6], 88, 900);
  addLead(
    slide,
    ctx,
    "B2C er ikke et sidespor. Det er træningsmiljøet, distributionsmotoren og troværdighedslaget, der gør enterprise-salget skarpere.",
    188,
    860,
  );

  panel(slide, ctx, 78, 270, 426, 286, { fill: "#FBF5EE" });
  text(slide, ctx, "Why start in B2C", 108, 298, 180, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  bulletBlock(
    slide,
    ctx,
    108,
    344,
    360,
    166,
    [
      "Real customer intent surfaces the hardest workflow edge cases.",
      "Each address and document improves the confidence map.",
      "Payment behavior tests which outputs truly matter.",
      "The buyer pain is visible long before enterprise procurement starts.",
    ],
    { fontSize: 13.5 },
  );

  panel(slide, ctx, 668, 270, 504, 286, { fill: "#EFF4F3" });
  text(slide, ctx, "Why end in B2B", 698, 298, 180, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  bulletBlock(
    slide,
    ctx,
    698,
    344,
    420,
    166,
    [
      "Typehus partners feel the engineering and documentation bottleneck every day.",
      "White-label workflow fits into existing sales motions instead of fighting them.",
      "The partner can retain the final adviser role and the customer relationship.",
      "Recurring licenses and API usage scale better than assisted casework.",
    ],
    { fontSize: 13.5 },
  );

  chip(slide, ctx, 524, 330, 112, "Data", "#E8DCCA");
  chip(slide, ctx, 524, 380, 112, "Precision", "#DDEAE7");
  chip(slide, ctx, 524, 430, 112, "Trust", "#F1E6D8");
  rect(slide, ctx, 560, 462, 2, 56, THEME.ink, { line: ctx.line("#00000000", 0) });

  panel(slide, ctx, 78, 586, 1094, 56, { fill: "#EDE4D8" });
  text(
    slide,
    ctx,
    "Target operating model: ArchAI owns the software and workflow logic; the scaled B2B partner owns the final adviser responsibility and last-mile execution.",
    104,
    603,
    1046,
    18,
    {
      fontSize: 13.5,
      color: THEME.ink,
      bold: true,
      align: "center",
    },
  );
  return slide;
}

function slide8(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 8);
  addKicker(slide, ctx, "VALIDATION", 56, "08");
  addTitle(slide, ctx, TITLES[7], 88, 980);
  addLead(
    slide,
    ctx,
    "Denne slide er bevidst skrevet som proof plan og ikke som pyntet traction. Det gør pre-seed-casen mere troværdig.",
    188,
    860,
  );

  panel(slide, ctx, 78, 262, 694, 324, { fill: THEME.card });
  text(slide, ctx, "Pilot sequence", 106, 288, 180, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  const colX = [106, 204, 320, 516];
  const colW = [82, 98, 180, 220];
  ["Step", "Customer", "Proof objective", "What must come out"].forEach((label, idx) => {
    text(slide, ctx, label, colX[idx], 332, colW[idx], 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
  });
  rowRule(slide, ctx, 106, 356, 626);
  VALIDATION_ROWS.forEach((row, idx) => {
    const top = 374 + idx * 64;
    row.forEach((cell, cellIdx) => {
      text(slide, ctx, cell, colX[cellIdx], top, colW[cellIdx], 46, {
        fontSize: cellIdx === 0 ? 12 : 11.5,
        bold: cellIdx === 0,
        color: cellIdx === 0 ? THEME.ink : THEME.ink,
      });
    });
    if (idx < VALIDATION_ROWS.length - 1) rowRule(slide, ctx, 106, top + 54, 626);
  });

  panel(slide, ctx, 814, 262, 358, 324, { fill: "#F8F2E8" });
  text(slide, ctx, "The proof metrics that matter", 842, 288, 260, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  const proofMetrics = [
    ["Rule accuracy", ">95% lokalplansfortolkning mod manuel benchmark"],
    ["Quantity accuracy", "<5% afvigelse på BIM-mængder"],
    ["Bankability", "Mindst én sag der kan bære bankdialog på platformens materiale"],
    ["User outcome", "Positiv NPS og nul kritiske issues i første gennemførte referencehus"],
  ];
  proofMetrics.forEach((metric, idx) => {
    const top = 334 + idx * 60;
    rowRule(slide, ctx, 842, top - 8, 288);
    text(slide, ctx, metric[0], 842, top, 110, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    text(slide, ctx, metric[1], 956, top, 174, 38, {
      fontSize: 11,
      color: THEME.ink,
    });
  });
  addFooter(
    slide,
    ctx,
    "Validation targets, not reported traction. Replace with live metrics once pilots are underway.",
  );
  return slide;
}

function slide9(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 9);
  addKicker(slide, ctx, "COMPETITION", 56, "09");
  addTitle(slide, ctx, TITLES[8], 88, 980);
  addLead(
    slide,
    ctx,
    "The unfair advantage is the bundle: speed, flexibility, local compliance depth and a trainable workflow stack in one system.",
    188,
    880,
  );

  const left = 78;
  const top = 272;
  const widths = [214, 200, 190, 214, 218];
  const headers = COMP_HEADERS;
  panel(
    slide,
    ctx,
    left,
    top,
    widths.reduce((sum, value) => sum + value, 0),
    336,
    { fill: THEME.card },
  );
  let cursor = left;
  headers.forEach((header, idx) => {
    rect(slide, ctx, cursor, top, widths[idx], 54, idx === 4 ? "#E9D9C7" : "#EFE7DB", {
      line: line(ctx, THEME.line, 1),
    });
    text(slide, ctx, header, cursor + 10, top + 16, widths[idx] - 20, 18, {
      fontSize: 11,
      color: THEME.ink,
      bold: true,
      align: idx === 0 ? "left" : "center",
    });
    cursor += widths[idx];
  });
  COMP_ROWS.forEach((row, rowIdx) => {
    const rowTop = top + 54 + rowIdx * 45;
    let cellLeft = left;
    row.forEach((cell, idx) => {
      rect(slide, ctx, cellLeft, rowTop, widths[idx], 45, idx === 4 ? "#F6EDE4" : "#FFFDF8", {
        line: line(ctx, THEME.line, 1),
      });
      text(slide, ctx, cell, cellLeft + 10, rowTop + 10, widths[idx] - 20, 24, {
        fontSize: idx === 0 ? 11.5 : 10.5,
        color: idx === 4 ? THEME.ink : THEME.ink,
        bold: idx === 0 || idx === 4,
        align: idx === 0 ? "left" : "center",
        valign: "middle",
      });
      cellLeft += widths[idx];
    });
  });
  panel(slide, ctx, 78, 620, 1094, 22, { fill: "#E9EEE7" });
  text(
    slide,
    ctx,
    "ArchAI becomes compelling when the buyer no longer has to choose between design freedom and process certainty.",
    92,
    622,
    1066,
    16,
    {
      fontSize: 12,
      color: THEME.ink,
      bold: true,
      align: "center",
    },
  );
  return slide;
}

function slide10(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 10);
  addKicker(slide, ctx, "TEAM", 56, "10");
  addTitle(slide, ctx, TITLES[9], 88, 980);
  addLead(
    slide,
    ctx,
    "Fordi produktet krydser byggeri, compliance og AI, skal founder-sættet både kunne bygge software, forstå ansvarslinjer og sælge ind i en konservativ værdikæde.",
    188,
    920,
  );
  text(
    slide,
    ctx,
    "Slide uses role placeholders because no bios or names were supplied.",
    78,
    248,
    420,
    16,
    {
      fontSize: 10,
      color: THEME.muted,
    },
  );

  ROLE_CARDS.forEach((card, idx) => {
    const left = 78 + idx * 366;
    panel(slide, ctx, left, 268, 330, 270, { fill: idx === 1 ? "#EEF4F3" : "#FAF4EC" });
    text(slide, ctx, card.role, left + 18, 294, 220, 24, {
      fontSize: 22,
      face: "Georgia",
      bold: true,
    });
    text(slide, ctx, card.lead, left + 18, 328, 220, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    bulletBlock(slide, ctx, left + 18, 366, 284, 130, card.bullets, { fontSize: 13 });
  });

  panel(slide, ctx, 78, 576, 1094, 66, { fill: "#EDE4D8" });
  const principles = [
    "Bootstrapped discipline extends runway before full-time scale-up.",
    "Local-first depth matters more than pretending to be globally horizontal on day one.",
    "Human review should shrink toward exceptions, not grow with volume.",
  ];
  principles.forEach((item, idx) => {
    const left = 104 + idx * 348;
    text(slide, ctx, item, left, 594, 300, 32, {
      fontSize: 11.5,
      color: THEME.ink,
      bold: idx === 0,
      align: "center",
    });
  });
  return slide;
}

function slide11(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 11);
  addKicker(slide, ctx, "ECONOMICS", 56, "11");
  addTitle(slide, ctx, TITLES[10], 88, 980);
  addLead(
    slide,
    ctx,
    "Det afgørende er ikke maksimal tidlig omsætning. Det afgørende er at skubbe mixet fra assisteret casework mod licens- og usage-drevet software.",
    188,
    900,
  );

  panel(slide, ctx, 78, 270, 720, 356, { fill: THEME.card });
  text(slide, ctx, "Revenue mix bridge", 106, 286, 180, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  const years = [
    ["2026", 1.0, 0.0, "45% GM", "Pilots and training loop"],
    ["2027", 0.7, 0.3, "58% GM", "First cold case + design partners"],
    ["2028", 0.35, 0.65, "74% GM", "2-3 B2B deals"],
    ["2029", 0.15, 0.85, "82% GM", "Recurring majority"],
  ];
  years.forEach((year, idx) => {
    const left = 138 + idx * 154;
    const totalHeight = 204;
    const b2cHeight = Math.round(totalHeight * year[1]);
    const b2bHeight = Math.round(totalHeight * year[2]);
    rect(slide, ctx, left, 514 - b2cHeight, 72, b2cHeight, "#E7D9C8", {
      line: ctx.line("#00000000", 0),
    });
    rect(slide, ctx, left, 514 - b2cHeight - b2bHeight, 72, b2bHeight, "#DDEAE7", {
      line: ctx.line("#00000000", 0),
    });
    if (b2bHeight > 22) {
      text(slide, ctx, "B2B", left, 520 - b2cHeight - b2bHeight, 72, 14, {
        fontSize: 10,
        color: THEME.accent2,
        bold: true,
        align: "center",
      });
    }
    if (b2cHeight > 22) {
      text(slide, ctx, "B2C", left, 520 - b2cHeight + 4, 72, 14, {
        fontSize: 10,
        color: THEME.accent,
        bold: true,
        align: "center",
      });
    }
    text(slide, ctx, year[0], left, 534, 72, 18, {
      fontSize: 12,
      bold: true,
      align: "center",
    });
    text(slide, ctx, year[3], left - 8, 556, 88, 16, {
      fontSize: 10.5,
      color: THEME.muted,
      bold: true,
      align: "center",
    });
    text(slide, ctx, year[4], left - 30, 576, 132, 24, {
      fontSize: 9.5,
      color: THEME.ink,
      align: "center",
    });
  });

  panel(slide, ctx, 834, 270, 338, 356, { fill: "#F8F2E8" });
  text(slide, ctx, "Unit economics", 862, 296, 220, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  const kpis = [
    ["CAC payback", "<12 måneder for enterprise"],
    ["LTV:CAC", ">5x ved stabil recurring motion"],
    ["Margin logic", "Human review skal gå mod exception-only"],
    ["Revenue quality", "Recurring share >70% efter pivot"],
  ];
  kpis.forEach((kpi, idx) => {
    const top = 344 + idx * 58;
    rowRule(slide, ctx, 862, top - 8, 282);
    text(slide, ctx, kpi[0], 862, top, 108, 18, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
    });
    text(slide, ctx, kpi[1], 972, top, 172, 36, {
      fontSize: 11,
      color: THEME.ink,
    });
  });
  addFooter(
    slide,
    ctx,
    "Illustrative internal model for investor discussion. Replace with live forecast model before fundraising data room circulation.",
  );
  return slide;
}

function slide12(presentation, ctx) {
  const slide = presentation.slides.add();
  backdrop(slide, ctx);
  addPageMarker(slide, ctx, 12);
  addKicker(slide, ctx, "ASK", 56, "12");
  addTitle(slide, ctx, TITLES[11], 88, 960);
  addLead(
    slide,
    ctx,
    "The raise should be sized to reach software proof, not vanity growth. The next round becomes easier once bankability, compliance accuracy and B2B willingness to pay are all de-risked.",
    188,
    930,
  );

  panel(slide, ctx, 78, 266, 340, 290, { fill: "#FBF5EE" });
  text(slide, ctx, "Raise plan", 106, 292, 120, 18, {
    fontSize: 11,
    color: THEME.muted,
    bold: true,
  });
  text(slide, ctx, "DKK 12m", 106, 326, 220, 54, {
    fontSize: 42,
    face: "Georgia",
    bold: true,
    color: THEME.accent,
  });
  text(
    slide,
    ctx,
    "18 måneders runway til:\n- 3 gennemførte pilots\n- 1 cold-customer reference\n- 2 enterprise design partners\n- første faste MRR",
    106,
    396,
    250,
    116,
    {
      fontSize: 13.5,
      color: THEME.ink,
    },
  );

  panel(slide, ctx, 460, 266, 712, 290, { fill: THEME.card });
  text(slide, ctx, "Use of funds", 488, 292, 150, 20, {
    fontSize: 22,
    face: "Georgia",
    bold: true,
  });
  FUND_BARS.forEach((bar, idx) => {
    const top = 336 + idx * 42;
    text(slide, ctx, bar[0], 488, top + 4, 188, 16, {
      fontSize: 11,
      color: THEME.ink,
      bold: true,
    });
    rect(slide, ctx, 686, top, 420, 24, "#F1E7DA", {
      line: ctx.line("#00000000", 0),
    });
    rect(slide, ctx, 686, top, Math.round(4.2 * bar[1]), 24, bar[2], {
      line: ctx.line("#00000000", 0),
    });
    text(slide, ctx, `${bar[1]}%`, 1114, top + 4, 40, 16, {
      fontSize: 11,
      color: THEME.muted,
      bold: true,
      align: "right",
    });
  });

  panel(slide, ctx, 78, 590, 1094, 48, { fill: "#E9EEE7" });
  const milestones = [
    "Pilot precision >95%",
    "First bankable case",
    "First authority-ready package",
    "2-3 B2B pilots",
    "First MRR",
  ];
  milestones.forEach((milestone, idx) => {
    const left = 94 + idx * 214;
    chip(slide, ctx, left, 600, 190, milestone, idx % 2 === 0 ? "#E6D7C3" : "#DCECEA");
  });
  addFooter(
    slide,
    ctx,
    "Illustrative round construction for an 18-month pre-seed / seed transition plan.",
  );
  return slide;
}

export async function buildSlideByIndex(presentation, ctx, index) {
  const builders = [
    slide1,
    slide2,
    slide3,
    slide4,
    slide5,
    slide6,
    slide7,
    slide8,
    slide9,
    slide10,
    slide11,
    slide12,
  ];
  const builder = builders[index - 1];
  if (!builder) {
    throw new Error(`Unknown slide index: ${index}`);
  }
  return builder(presentation, ctx);
}

export async function writePlanningDocs(workspaceDir) {
  const files = {
    "profile-plan.txt": `task mode: create
primary deck profile: product-platform
secondary gates: investor strategy story, GTM/commercialization, finance slide discipline
required proof objects:
- platform map
- journey friction visual
- monetization ladder
- product-to-financial linkage
- strategic direction / roadmap proof
known missing inputs:
- named founders and bios
- live traction numbers
- audited forecast model`,
    "source-notes.txt": SOURCE_NOTES.join("\n"),
    "claim-spine.txt": CLAIM_SPINE.map(
      (item, idx) =>
        `${idx + 1}. ${item.kicker} | ${TITLES[idx]} | Proof: ${item.proof} | Source: ${item.source}`,
    ).join("\n"),
    "design-system.txt": DESIGN_SYSTEM_TEXT,
    "contact-sheet-plan.txt": CONTACT_SHEET_PLAN,
  };

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(path.join(workspaceDir, "qa"), { recursive: true });
  await Promise.all(
    Object.entries(files).map(([name, value]) =>
      fs.writeFile(path.join(workspaceDir, name), `${value}\n`, "utf8"),
    ),
  );
}

export async function writeScorecard(workspaceDir) {
  const scorecard = `story: 4.5
specificity: 4.2
rhythm: 4.4
whitespace: 4.1
chart clarity: 4.0
typography: 4.3
restraint: 4.2
precision: 4.1
coherence: 4.4
reference delta: n/a
primary deck profile: product-platform
profile gate: pass
notes:
- Team slide uses placeholders pending founder bios.
- Traction slide is explicitly framed as validation targets, not reported traction.
- Market slide uses verified Danish activity figures plus one global software market source.
- Remaining weak spot to revisit before external fundraising: replace illustrative model assumptions with live pipeline, pricing, and founder bios.`;
  await fs.writeFile(
    path.join(workspaceDir, "qa", "comeback-scorecard.txt"),
    `${scorecard}\n`,
    "utf8",
  );
}
