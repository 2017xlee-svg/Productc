/**
 * Seed data: Curated benchmark catalog with exactly 3 products and 3 comprehensive reviews.
 * Optimized for comparison testing with clean numeric metrics and rich-text specifications.
 */

import { Product, Specification, UserReview, AppUser, DatabaseState } from "../types";

export const PRODUCT_ID_SONY = "recSonyPx470Benchmark";
export const PRODUCT_ID_PLAUD = "recyjZnFD30NiXoRwjF";
export const PRODUCT_ID_SAMSUNG = "recQRftAV957mVdyRwD";

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: PRODUCT_ID_SONY,
    name: "sony px470",
    brand: "Sony",
    tags: ["Voice Recorder", "IT product", "Audio"],
    overview: "Compact digital voice recorder with built-in USB direct connector, S-Microphone stereo system, and exceptional 55-hour battery life powered by standard AAA batteries.",
    pictures: [
      {
        id: "att-sony-px470-main",
        name: "Sony_ICD-PX470.jpg",
        url: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80",
        smUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=300&q=80",
        lgUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=1200&q=80",
        mimetype: "image/jpeg",
        size: 145000,
      },
    ],
    specificationIds: [
      "spec-sony-1-price",
      "spec-sony-2-weight",
      "spec-sony-3-size",
      "spec-sony-4-material",
      "spec-sony-5-battery",
      "spec-sony-6-mics",
      "spec-sony-7-mode",
      "spec-sony-8-pickup",
      "spec-sony-9-storage",
      "spec-sony-10-transfer",
      "spec-sony-11-warranty",
    ],
    reviewIds: ["recRevPlaudVsSonyComparison", "recRevSonyPx470InDepth"],
    createdTime: "2026-09-01T10:00:00.000Z",
  },
  {
    id: PRODUCT_ID_PLAUD,
    name: "Plaud note",
    brand: "Plaud",
    tags: ["Ai voice recorder", "IT product", "Audio", "Wearable"],
    overview: "Ultra-slim AI voice recorder with dual-mode recording for phone calls and in-person meetings, powered by OpenAI Whisper for automated transcription, summaries, and mind maps.",
    pictures: [
      {
        id: "att-plaud-note-main",
        name: "Plaud_Note_Voice_Recorder.jpg",
        url: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80",
        smUrl: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=300&q=80",
        lgUrl: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=1200&q=80",
        mimetype: "image/jpeg",
        size: 182000,
      },
    ],
    specificationIds: [
      "spec-plaud-1-price",
      "spec-plaud-2-weight",
      "spec-plaud-3-size",
      "spec-plaud-4-material",
      "spec-plaud-5-battery",
      "spec-plaud-6-mics",
      "spec-plaud-7-mode",
      "spec-plaud-8-pickup",
      "spec-plaud-9-storage",
      "spec-plaud-10-transfer",
      "spec-plaud-11-warranty",
    ],
    reviewIds: ["recRevPlaudVsSonyComparison"],
    createdTime: "2026-09-01T11:00:00.000Z",
  },
  {
    id: PRODUCT_ID_SAMSUNG,
    name: "Samsung fold 8",
    brand: "Samsung",
    tags: ["Smartphone", "IT product", "Foldable"],
    overview: "Next-generation flagship foldable smartphone featuring 7.6-inch Dynamic AMOLED 2X main display, Snapdragon processor, Galaxy AI transcription, and pro-grade cameras.",
    pictures: [
      {
        id: "att-samsung-fold-main",
        name: "Samsung_Fold_8.jpg",
        url: "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=800&q=80",
        smUrl: "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=300&q=80",
        lgUrl: "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=1200&q=80",
        mimetype: "image/jpeg",
        size: 210000,
      },
    ],
    specificationIds: [
      "spec-samsung-1-price",
      "spec-samsung-2-weight",
      "spec-samsung-3-size",
      "spec-samsung-4-material",
      "spec-samsung-5-battery",
      "spec-samsung-6-mics",
      "spec-samsung-7-mode",
      "spec-samsung-8-pickup",
      "spec-samsung-9-storage",
      "spec-samsung-10-transfer",
      "spec-samsung-11-warranty",
    ],
    reviewIds: ["recRevGalaxyFold8Review"],
    createdTime: "2026-09-01T12:00:00.000Z",
  },
];

export const INITIAL_SPECIFICATIONS: Specification[] = [
  // --- 1. SONY PX470 SPECS ---
  {
    id: "spec-sony-1-price",
    specName: "MSRP Price",
    details: "$79.99 (RM329)",
    unit: "$",
    isNumeric: true,
    order: 1,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-2-weight",
    specName: "Weight",
    details: "74 g",
    unit: "g",
    isNumeric: true,
    order: 2,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-3-size",
    specName: "Dimensions / Size",
    details: "114.1 mm x 38.3 mm x 19.3 mm\n(Height x Width x Depth)",
    unit: "mm",
    isNumeric: false,
    order: 3,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-4-material",
    specName: "Device Material",
    details: "Durable textured polycarbonate plastic chassis with tactile control keys",
    isNumeric: false,
    order: 4,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-5-battery",
    specName: "Battery Life",
    details: "55 Hours (MP3 192kbps) / Up to 62 Hours (48kbps monaural) on 2x standard AAA batteries",
    unit: "Hours",
    isNumeric: true,
    order: 5,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-6-mics",
    specName: "Microphone System",
    details: "2 High-sensitivity stereo condenser microphones with S-Microphone processing",
    isNumeric: false,
    order: 6,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-7-mode",
    specName: "Recording Mode",
    details: "<b>Focus Mode:</b> Narrows recording angle to capture a single voice clearly from a distance.\n<b>Wide-Stereo Mode:</b> Opens up stereo width to record meeting rooms and multiple participants.\n<b>Scene Select:</b> Preset EQ filters for lectures, voice notes, music, and interviews.",
    isNumeric: false,
    order: 7,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-8-pickup",
    specName: "Audio Pickup Range",
    details: "Up to 7.6 meters (20 to 25 feet) in large lecture halls when using Focus Mode with low-cut filter",
    unit: "m",
    isNumeric: false,
    order: 8,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-9-storage",
    specName: "Local Storage",
    details: "4 GB internal flash memory (expandable up to 32 GB via microSD slot)",
    unit: "GB",
    isNumeric: true,
    order: 9,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-10-transfer",
    specName: "File Transfer",
    details: "Direct Built-in USB Type-A connector. Plugs directly into any PC or laptop with no cable needed.",
    isNumeric: false,
    order: 10,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },
  {
    id: "spec-sony-11-warranty",
    specName: "Warranty",
    details: "1 year manufacturer limited warranty",
    unit: "year",
    isNumeric: true,
    order: 11,
    productId: PRODUCT_ID_SONY,
    productTitle: "sony px470",
    pictures: [],
  },

  // --- 2. PLAUD NOTE SPECS ---
  {
    id: "spec-plaud-1-price",
    specName: "MSRP Price",
    details: "$159.00 (RM849)",
    unit: "$",
    isNumeric: true,
    order: 1,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-2-weight",
    specName: "Weight",
    details: "30 g",
    unit: "g",
    isNumeric: true,
    order: 2,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-3-size",
    specName: "Dimensions / Size",
    details: "85.6 mm x 54.1 mm x 2.99 mm\n(Ultra-slim credit card format)",
    unit: "mm",
    isNumeric: false,
    order: 3,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-4-material",
    specName: "Device Material",
    details: "Aerospace-grade 6000-series anodized aluminum alloy casing",
    isNumeric: false,
    order: 4,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-5-battery",
    specName: "Battery Life",
    details: "30 Hours continuous recording / Up to 60 Days standby (400 mAh rechargeable Li-Po)",
    unit: "Hours",
    isNumeric: true,
    order: 5,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-6-mics",
    specName: "Microphone System",
    details: "2 MEMS Microphones + 1 Vibration Conduction Sensor (VCS/VPU) for MagSafe phone call capture",
    isNumeric: false,
    order: 6,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-7-mode",
    specName: "Recording Mode",
    details: "<b>Dual-Mode Physical Switch:</b>\n• <b>Note Mode:</b> Uses air-conduction MEMS mics for ambient room, meeting & lecture capture.\n• <b>Call Mode:</b> Uses the VPU vibration sensor through phone MagSafe back to record bilateral calls.\n<b>AI Post-Processing:</b> Whisper AI transcription, automatic summaries, and mind maps.",
    isNumeric: false,
    order: 7,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-8-pickup",
    specName: "Audio Pickup Range",
    details: "Up to 3.0 meters (9.8 feet) optimal acoustic capture distance for voices",
    unit: "m",
    isNumeric: false,
    order: 8,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-9-storage",
    specName: "Local Storage",
    details: "64 GB internal eMMC flash storage (stores up to 480 hours of high-fidelity audio)",
    unit: "GB",
    isNumeric: true,
    order: 9,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-10-transfer",
    specName: "File Transfer",
    details: "Wireless Bluetooth 5.2 (BLE) and Wi-Fi 2.4GHz automatic syncing to iOS and Android companion app",
    isNumeric: false,
    order: 10,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },
  {
    id: "spec-plaud-11-warranty",
    specName: "Warranty",
    details: "1 year manufacturer replacement warranty",
    unit: "year",
    isNumeric: true,
    order: 11,
    productId: PRODUCT_ID_PLAUD,
    productTitle: "Plaud note",
    pictures: [],
  },

  // --- 3. SAMSUNG FOLD 8 SPECS ---
  {
    id: "spec-samsung-1-price",
    specName: "MSRP Price",
    details: "$1799.00",
    unit: "$",
    isNumeric: true,
    order: 1,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-2-weight",
    specName: "Weight",
    details: "239 g",
    unit: "g",
    isNumeric: true,
    order: 2,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-3-size",
    specName: "Dimensions / Size",
    details: "153.5 mm x 68.1 mm x 12.1 mm (Folded)\n153.5 mm x 132.6 mm x 5.6 mm (Unfolded)",
    unit: "mm",
    isNumeric: false,
    order: 3,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-4-material",
    specName: "Device Material",
    details: "Armor Aluminum alloy frame with Corning Gorilla Armor Ceramic back and IP48 water resistance",
    isNumeric: false,
    order: 4,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-5-battery",
    specName: "Battery Life",
    details: "4400 mAh dual-cell battery with 45W wired and 15W wireless fast charging (approx. 21 hrs video playback)",
    unit: "mAh",
    isNumeric: true,
    order: 5,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-6-mics",
    specName: "Microphone System",
    details: "Triple beamforming microphone array with directional zoom audio capture and AI voice isolation",
    isNumeric: false,
    order: 6,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-7-mode",
    specName: "Recording Mode",
    details: "<b>Samsung Voice Recorder:</b> Standard, Interview (bi-directional), and Speech-to-Text.\n<b>Galaxy AI Transcript Assist:</b> Live multilingual translation, speaker tagging, and meeting summaries.\n<b>Pro Video Audio:</b> Omni-directional, front-focus, and rear-focus mic selection with level metering.",
    isNumeric: false,
    order: 7,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-8-pickup",
    specName: "Audio Pickup Range",
    details: "Up to 5.0 meters with directional beamforming array and AI noise reduction",
    unit: "m",
    isNumeric: false,
    order: 8,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-9-storage",
    specName: "Local Storage",
    details: "512 GB UFS 4.0 high-speed internal flash storage with 16 GB LPDDR5X RAM",
    unit: "GB",
    isNumeric: true,
    order: 9,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-10-transfer",
    specName: "File Transfer",
    details: "USB 3.2 Gen 1 Type-C with DisplayPort output, Wi-Fi 7 (802.11be), and Quick Share instant transfer",
    isNumeric: false,
    order: 10,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
  {
    id: "spec-samsung-11-warranty",
    specName: "Warranty",
    details: "1 year manufacturer warranty with 1 year Samsung Care+ accidental damage protection",
    unit: "year",
    isNumeric: true,
    order: 11,
    productId: PRODUCT_ID_SAMSUNG,
    productTitle: "Samsung fold 8",
    pictures: [],
  },
];

export const INITIAL_REVIEWS: UserReview[] = [
  // --- REVIEW 1: PLAUD NOTE VS SONY PX470 ---
  {
    id: "recRevPlaudVsSonyComparison",
    reviewNumber: 1,
    title: "Plaud Note vs Sony PX470: Traditional Voice Recorder vs Modern AI Assistant",
    productIds: [PRODUCT_ID_PLAUD, PRODUCT_ID_SONY],
    productTitles: ["Plaud note", "sony px470"],
    authorName: "Alex Tan (Tech Analyst)",
    rating: 5,
    pros: [
      "Plaud AI transcription & summaries save hours of manual typing",
      "Sony PX470 built-in direct USB plug requires zero extra cables",
      "Sony has unbeatable 55-hour battery life on standard AAA batteries",
      "Plaud records phone calls effortlessly via MagSafe vibration sensor",
      "Plaud credit-card thickness fits inside any wallet or phone sleeve",
    ],
    cons: [
      "Plaud requires ongoing AI subscription for unlimited monthly transcription",
      "Sony PX470 plastic chassis feels bulkier compared to Plaud's aluminum body",
    ],
    body: `### Executive Comparison: Traditional Reliability vs AI Workflow

Comparing the **Sony ICD-PX470** and the **Plaud Note** reveals a distinct contrast in design philosophy.

#### 1. Hardware & Portability
- **Sony PX470:** Weighs 74g with a thicker 19.3mm plastic body. While bulkier, it feels rugged and dependable with physical sliding switches that prevent accidental stops. The built-in USB-A plug is legendary: slide it out, plug it straight into any laptop, and your WAV/MP3 files are immediately available.
- **Plaud Note:** At just 30g and 2.99mm thin, it is an engineering marvel. It magnetically snaps to the back of an iPhone or Android phone without adding noticeable weight.

#### 2. Microphone & Audio Quality
- **Sony PX470:** Features Sony's S-Microphone stereo system. In large lecture halls, the Focus Mode is unmatched: it narrows the pickup angle and captures clear speech up to 7.6 meters (25 feet) away with minimal hiss.
- **Plaud Note:** Uses dual MEMS microphones and a specialized VPU vibration conduction sensor. While ambient room audio is good up to 3 meters, its superpower is the vibration sensor, which captures phone calls cleanly without speakerphone distortion.

#### 3. Software & Productivity
- **Sony PX470:** Traditional workflow: records raw audio. You listen back, take manual notes, and organize files by folders.
- **Plaud Note:** 4-step modern workflow:
  1. Record meeting or phone call
  2. Auto-generate transcription via OpenAI Whisper
  3. Generate structured summaries, key action points, and mind maps
  4. Export directly to Markdown, Notion, or PDF

#### Recommendation
- Choose **Sony ICD-PX470** if you need an affordable, zero-subscription workhorse for university lectures, courtroom transcription, or field reporting with 55+ hours battery life.
- Choose **Plaud Note** if you conduct frequent client meetings and phone calls and want AI to do the heavy lifting of note-taking and summarizing.`,
    pictures: [],
    createdTime: "2026-09-02T14:30:00.000Z",
  },

  // --- REVIEW 2: SONY PX470 IN-DEPTH ---
  {
    id: "recRevSonyPx470InDepth",
    reviewNumber: 2,
    title: "Sony ICD-PX470 Long-Term Test: The Benchmark for Field & Lecture Recording",
    productIds: [PRODUCT_ID_SONY],
    productTitles: ["sony px470"],
    authorName: "Prof. Daniel Miller",
    rating: 5,
    pros: [
      "Focus mode captures lecturer clearly from 25 feet away",
      "Plug-and-play USB with zero driver install on Mac, Windows & Linux",
      "MicroSD card expansion supports up to 32GB extra storage",
      "Instant one-click recording even when powered off",
      "Unmatched 55-hour recording time on two inexpensive AAA batteries",
    ],
    cons: [
      "No built-in Bluetooth for wireless smartphone transfer",
      "Monochrome LCD display looks utilitarian compared to modern touchscreens",
    ],
    body: `### 12-Month Field Review: Sony ICD-PX470

After using the Sony ICD-PX470 across over 100 lecture sessions, it has proven to be the most reliable voice recorder in its price bracket.

#### Key Highlights
- **Battery Independence:** Running on two standard AAA alkaline batteries gives over 55 hours of real-world recording time. If the battery dies in the middle of a conference, you swap in fresh AAAs in 5 seconds without waiting for a USB charger.
- **Slide-Out USB Connector:** No cables needed. Slide the lever on the back, plug it directly into a PC, and drag off standard MP3 or high-fidelity L-PCM WAV files.
- **Speech Clarity:** The S-Microphone system paired with the hardware Low-Cut Filter effectively cuts out air conditioning hum and projector noise, keeping speech crisp and legible.`,
    pictures: [],
    createdTime: "2026-09-03T09:15:00.000Z",
  },

  // --- REVIEW 3: SAMSUNG FOLD 8 ---
  {
    id: "recRevGalaxyFold8Review",
    reviewNumber: 3,
    title: "Samsung Galaxy Fold 8: The Definitive Multitasking & Productivity Beast",
    productIds: [PRODUCT_ID_SAMSUNG],
    productTitles: ["Samsung fold 8"],
    authorName: "Sarah Jenkins (Senior Mobile Reviewer)",
    rating: 5,
    pros: [
      "Expansive 7.6-inch canvas is unmatched for side-by-side app comparison",
      "Galaxy AI Voice Recorder provides real-time speaker separation and summaries",
      "Refined titanium hinge closes completely flat with IP48 water resistance",
      "Bright 2600-nit outdoor peak display visibility",
    ],
    cons: [
      "Premium flagship price tag",
      "Narrower outer cover screen requires muscle memory adjustment",
    ],
    body: `### Comprehensive Review: Samsung Galaxy Fold 8

The Galaxy Fold 8 represents the pinnacle of mobile productivity hardware, seamlessly bridging the gap between flagship phone and full-powered tablet.

#### Productivity & Audio Capabilities
- **Split-Screen Multitasking:** Running a voice recording app on one half while taking S-Pen notes or reviewing specification matrices on the other half transforms field workflows.
- **Galaxy AI Transcript Assist:** The built-in Voice Recorder uses on-device neural processing to separate multiple speakers, translate across 16 languages, and produce formatted bullet-point summaries.
- **Hardware Durability:** The Armor Aluminum frame and refined dual-rail hinge provide a reassuring, solid snap with no visible screen creasing during daily use.`,
    pictures: [],
    createdTime: "2026-09-04T16:00:00.000Z",
  },
];

export const INITIAL_USERS: AppUser[] = [
  {
    id: "usr-admin-default",
    name: "Admin User",
    email: "admin@local.app",
    role: "Admin",
  },
];

export const INITIAL_DATABASE: DatabaseState = {
  products: INITIAL_PRODUCTS,
  specifications: INITIAL_SPECIFICATIONS,
  reviews: INITIAL_REVIEWS,
  users: INITIAL_USERS,
  sourceUrl: "local",
  shareId: "",
  baseId: "",
  lastSynced: "2026-09-04T16:00:00.000Z",
};
