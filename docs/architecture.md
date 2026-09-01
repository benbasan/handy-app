# ארכיטקטורה טכנית — Handy

מסמך זה הוא ה"איך" הטכני: הסטאק, מבנה הריפו, מודל הנתונים, והאינטגרציות החיצוניות. ההחלטות כאן "נעולות" (ראו גם `CLAUDE.md` סעיף 2) — המטרה היא שקלוד קוד לא יצטרך (ולא יהיה רשאי) להמציא אותן מחדש בכל שיחה.

## 1. סטאק טכנולוגי ולמה

| שכבה | טכנולוגיה | למה |
|---|---|---|
| Framework | Next.js 14+ (App Router, TypeScript) | ריפו אחד ל-frontend+backend, Server Actions מפשטים כתיבה מאובטחת, פריסה קלה ל-Vercel |
| DB + Auth + Storage + Realtime | **Supabase** (Postgres בבסיס) | פותר בבת אחת: DB יחסי מלא, אימות OTP בטלפון, אחסון קבצים (תמונות/סרטונים/מסמכים), ועדכונים בזמן אמת (הצעות שמגיעות, מיקום חי) — בלי לבנות שרת נפרד |
| שפה | TypeScript, `strict: true` בכל הריפו | בטיחות טיפוסים לאורך כל השכבות, כולל טיפוסים שנוצרים אוטומטית מסכימת ה-DB |
| עיצוב | Tailwind CSS | תואם את טוקני העיצוב שיוצאו מ-Claude Design |
| מפות/גיאולוקיישן | Google Maps Platform (Maps JS API, Geocoding, Places Autocomplete, Distance Matrix) | כיסוי טוב בישראל, תיעוד מלא, ספריות React מוכנות |
| מיקום גיאוגרפי ב-DB | **PostGIS** (extension של Postgres, זמין ב-Supabase) | שאילתות "בעלי מקצוע ברדיוס X ק״מ מנקודה" צריכות אינדקס גיאוגרפי אמיתי, לא חישוב מרחק ב-JS |
| הרשמה/כניסה | Supabase Auth — Phone + OTP, ספק SMS: **Twilio** (מוגדר בתוך Supabase Auth) | Supabase תומכת ב-Twilio באופן מובנה; אין צורך לבנות זרימת OTP בעצמנו |
| PDF (קבלות) | להחליט בשלב התשלומים/קבלות (ראו `CLAUDE.md` סעיף 9) | |
| Hosting | Vercel (Next.js) + Supabase Cloud | |
| בדיקות | Vitest (יחידה) + Playwright (E2E לזרימות קריטיות, מ-Phase 4 והלאה) | |

### גרסאות בפועל (הותקנו ב-Phase 0)

Next **16.3.4** · React **19.2.8** · Tailwind **4.3.3** · TypeScript 5 · `@supabase/supabase-js` **2.112.4** · `@supabase/ssr` **0.12.5** · Supabase CLI **2.116.0** (devDependency, מורץ ב-`npx supabase`) · PostGIS **3.3** (בסטאק הלוקאלי).

שתי נקודות שנובעות מהגרסאות האלה ושלא היו במסמך המקורי:

1. **Tailwind v4 הוא CSS-first — אין `tailwind.config.ts`.** טוקני העיצוב מ-Claude Design נכנסים לבלוק `@theme` בתוך `app/globals.css`. שם מחפשים אותם, לא בקובץ קונפיג.
2. **`CLAUDE.md` ותיקיית `docs/` מוחרגות מ-Prettier** (ב-`.prettierignore`). Prettier מרפד תאי טבלה במרקדאון לפי רוחב תווים לטיניים, מה שהורס את היישור של טבלאות עבריות דו-כיווניות ומשכתב את המסמכים בכל הרצה.

### RTL — כלל מחייב

האפליקציה מרונדרת `<html lang="he" dir="rtl">` עם הפונט Heebo. **כל** מרווח/מיקום נכתב ב-logical properties של Tailwind (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`) ולא בפיזיים (`ml-`/`mr-`/`left-`/`right-`). ראו `CLAUDE.md` סעיף 3.

### פורטים לוקאליים

הסטאק הלוקאלי רץ על **5442x** במקום ברירת המחדל של Supabase (5432x), כדי שאפשר יהיה להריץ אותו במקביל לפרויקטי Supabase אחרים על אותה מכונה בלי התנגשות פורטים. מוגדר ב-`supabase/config.toml`, מתועד ב-`README.md`.

**החלטה חשובה:** אין שרת backend נפרד. כל הלוגיקה העסקית שרצה בצד שרת רצה כ-Next.js Server Actions / Route Handlers שמדברות עם Supabase, בתוספת Supabase Edge Functions למקומות שבהם נדרש טריגר מה-DB עצמו (למשל: שליחת התראה כשמתקבלת הצעה חדשה).

## 2. מבנה תיקיות

```
/app
  /(customer)/...           נתיבי לקוח: פרסום קריאה, מעקב, אזור אישי
  /(pro)/...                 נתיבי בעל מקצוע: פיד קריאות, הצעות, הכנסות
  /(admin)/...                לוח ניהול
  /(marketing)/...            עמודי SEO/תוכן ציבוריים
  /api/...                    Route Handlers (webhooks בלבד, ברירת מחדל היא Server Actions)
/components
  /ui                          קומפוננטות עיצוב גנריות
  /customer, /pro, /admin      קומפוננטות ספציפיות לתפקיד
/lib
  /supabase                    יצירת קליינט + טיפוסים מיוצרים אוטומטית מה-DB
  /validation                  סכמות Zod, קובץ אחד לכל ישות
  /actions                     Server Actions, מקובצים לפי ישות (jobs, bids, price-updates...)
  /maps                        עטיפות ל-Google Maps API (גיאוקוד, חישוב מרחק)
/supabase
  /migrations                  קבצי SQL — **מקור האמת היחיד** לסכימת ה-DB
  /seed.sql                    נתוני דמו לפיתוח מקומי
/docs                          מסמכי התכנון (התיקייה הזו)
```

**כלל ברזל:** כל שינוי סכימה עובר דרך קובץ migration חדש. שינוי ידני בממשק של Supabase שלא נלכד ב-migration = חוב טכני נסתר וגורם לקלוד קוד "לשכוח" את הסכימה האמיתית בין שיחות.

## 3. מודל הנתונים (טיוטת סכימה)

זו טיוטת ליבה למסד הנתונים, נגזרת מהעיצוב ומ-`product-spec.md`. השלב הראשון בפועל (Phase 1 ב-roadmap) יהפוך את זה למיגרציות SQL אמיתיות, כולל מדיניות RLS לכל טבלה.

```mermaid
erDiagram
    PROFILES ||--o{ JOBS : "posts (as customer)"
    PROFILES ||--o| PRO_PROFILES : "extends (as pro)"
    PRO_PROFILES ||--o{ VERIFICATION_DOCUMENTS : has
    PRO_PROFILES ||--o{ BIDS : submits
    PRO_PROFILES }o--o{ CATEGORIES : specializes_in
    JOBS ||--o{ BIDS : receives
    JOBS ||--o| BIDS : "selected_bid"
    JOBS ||--o{ PRICE_UPDATES : has
    JOBS ||--o{ MESSAGES : has
    JOBS ||--o| REVIEWS : has
    JOBS ||--o| COMMISSION_CHARGES : has
    JOBS ||--o| DISPUTES : "may have"
    JOBS }o--|| CATEGORIES : "belongs to"
    PROFILES ||--o{ SAVED_PROS : saves
    PRO_PROFILES ||--o{ SAVED_PROS : "saved by"

    PROFILES {
        uuid id PK
        text phone
        text full_name
        text role
        timestamptz created_at
    }
    PRO_PROFILES {
        uuid user_id PK "also FK to profiles.id"
        text bio
        int radius_km
        geography service_point
        text verification_status
        numeric rating_avg
        int jobs_completed_count
        boolean accepting_jobs
        int profile_strength_pct
    }
    VERIFICATION_DOCUMENTS {
        uuid id PK
        uuid pro_id FK
        text doc_type
        text file_url
        text status
        timestamptz reviewed_at
    }
    CATEGORIES {
        uuid id PK
        text name_he
        text slug
    }
    JOBS {
        uuid id PK
        uuid customer_id FK
        uuid category_id FK
        text description
        text[] photo_urls
        text video_url
        text voice_note_url
        geography location
        text address_text
        text preferred_time
        text status
        uuid selected_bid_id FK
        timestamptz created_at
    }
    BIDS {
        uuid id PK
        uuid job_id FK
        uuid pro_id FK
        numeric price
        int eta_minutes
        text note
        text status
        timestamptz expires_at
        timestamptz created_at
    }
    PRICE_UPDATES {
        uuid id PK
        uuid job_id FK
        uuid pro_id FK
        numeric original_price
        numeric new_price
        text photo_url
        text note
        text status
        timestamptz decided_at
    }
    MESSAGES {
        uuid id PK
        uuid job_id FK
        uuid sender_id FK
        text body
        timestamptz created_at
    }
    REVIEWS {
        uuid id PK
        uuid job_id FK
        int rating
        text comment
    }
    COMMISSION_CHARGES {
        uuid id PK
        uuid job_id FK
        numeric base_price
        numeric total_price
        numeric commission_amount
        text payment_method
        timestamptz charged_at
    }
    DISPUTES {
        uuid id PK
        uuid job_id FK
        uuid opened_by FK
        text reason
        text status
        numeric credit_amount
        timestamptz resolved_at
    }
    SAVED_PROS {
        uuid customer_id FK
        uuid pro_id FK
    }
```

### סטיות מהטיוטה — מה שנבנה בפועל ב-Phase 1

הסכימה למעלה היא הטיוטה המקורית. אלה ההבדלים בין הטיוטה למיגרציות שנכתבו בפועל (`supabase/migrations/2026090112*`):

| שינוי | למה |
|---|---|
| **`commission_charges.pro_id` נוסף** | בטיוטה בעל המקצוע נגזר דרך `job → selected_bid → pro`. מדיניות RLS של "בעל מקצוע רואה רק את ההכנסות שלו" הייתה הופכת ל-join דו-שלבי שמורץ על כל שורה — גם איטי וגם קשה לביקורת. עמודה מפורשת = השוואת עמודה אחת מאונדקסת. |
| **`bids`: `unique (job_id, pro_id)`** | הצעה אחת לכל בעל מקצוע לכל קריאה. |
| **`reviews`: `unique (job_id)`** | ה-ERD מגדיר `JOBS ||--o| REVIEWS` — נאכף בפועל. |
| **`price_updates.photo_url`: `not null` + `check` על מחרוזת לא ריקה** | חוק השקיפות הוא אילוץ במסד הנתונים, לא שדה חובה בטופס שאפשר לעקוף. |
| **סטטוסים כ-`text` + `check`, לא `enum` של Postgres** | תואם לטיוטה, ומאפשר להוסיף סטטוס בשלב עתידי בלי `ALTER TYPE`. |
| **פונקציות עזר ל-RLS** (`auth_role`, `is_admin`, `is_verified_pro`, `is_job_owner`, `is_assigned_pro`, `is_bidding_pro`, `pro_serves_point`) | כולן `security definer` עם `search_path` ריק. בלי `security definer`, מדיניות על `jobs` שקוראת `profiles` מפעילה את המדיניות של `profiles` וגורמת לרקורסיה. |
| **הרשאות ברמת עמודה (`grant update (col) ...`), לא רק RLS** | RLS בוחרת **שורות** ולא עמודות. מדיניות "מותר לך לעדכן את השורה שלך" הייתה מאפשרת ללקוח לשנות `role` שלו ל-`admin`, ולבעל מקצוע לשנות `verification_status` ו-`rating_avg` של עצמו. ה-grant הצר הוא מה שחוסם את זה בפועל. |
| **טריגר `handle_new_user` עם whitelist על ה-role** | `raw_user_meta_data` הוא קלט מהדפדפן — מה שנשלח ב-`options.data` מגיע כמו שהוא. רק `customer`/`pro` מכובדים; `admin` ניתן רק ב-SQL ישיר. |
| **`notifications`** — לא נוצרה | כפי שהטיוטה קובעת: תתווסף בשלב שבו בונים התראות. |
| **Storage buckets** — לא נוצרו | מופיעים בסעיף 6, אבל שייכים לשלב שמעלה קבצים בפועל (Phase 2/3), לא ל-Phase 1. |

**מה שלא נבנה ב-Phase 1 בכוונה:** מכונת המצבים של `price_updates` (`pending → approved/rejected`) והמחיר הנגזר — זהו Phase 5. ב-Phase 1 קיימים הטבלה, האילוצים והמדיניות בלבד.

### מבנה נתיבים ותפקידים (הוחלט ב-Phase 1)

Route groups ב-Next.js לא מוסיפים segment לנתיב, ולכן `(customer)` ו-`(pro)` לא יכולים שניהם להחזיק את `/login`. ההחלטה: **הלקוח יושב בשורש** (הוא הקהל העיקרי), בעל מקצוע ואדמין עם prefix.

| תפקיד | כניסה | בית |
|---|---|---|
| `customer` | `/login` | `/account` |
| `pro` | `/pro/login` | `/pro` |
| `admin` | `/admin/login` | `/admin` |

בתוך כל route group יש קבוצה מקוננת `(authed)` שה-layout שלה קורא `requireRole()`; מסך הכניסה נמצא **מחוץ** לקבוצה הזו, אחרת השער היה חוסם את הדלת שדרכה נכנסים.

**`proxy.ts` בשורש הריפו, לא `middleware.ts`** — Next 16 שינה את השם (אותה פונקציונליות, וכעת ברירת המחדל היא Node.js runtime). ה-proxy עושה שני דברים בלבד: מרענן את ה-cookies של Supabase, ומפנה מבקר אנונימי למסך הכניסה המתאים. הוא **לא** בודק role — לפי התיעוד של Next הוא רץ גם על prefetch ואסור לו לגשת למסד הנתונים. אכיפת ה-role היא ב-`requireRole()` שב-layout, וה-RLS מתחתיה היא מה שבאמת מגן על הנתונים.

### הערות מפתח למודל
- **`geography` (PostGIS point)** ב-`jobs.location` וב-`pro_profiles.service_point` — מאפשר שאילתת `ST_DWithin` יעילה ("כל בעלי המקצוע ברדיוס X מנקודה") עם אינדקס GiST, במקום לסרוק את כל הטבלה ולחשב מרחק ב-JS.
- **`bids.status`** כולל `pending / selected / rejected / expired` — פג תוקף מנוהל ע"י Edge Function מתוזמנת (cron) שרצה כל כמה דקות ומעדכנת הצעות שעברו 45 דקות.
- **`price_updates`** הוא הטבלה שאוכפת את חוק השקיפות: אין עמודת `price` ניתנת לעדכון ישיר בטבלת `jobs` — המחיר בפועל של קריאה הוא נגזרת (מחיר ההצעה שנבחרה + כל `price_updates` שאושרו).
- **`commission_charges`** נוצרת אוטומטית (טריגר DB או Server Action) עם סיום העבודה, ומחשבת 12% מהסכום הכולל.
- טבלת `notifications` תתווסף בשלב שבו בונים התראות בפועל (לא קריטית ל-Phase 1).

## 4. Row Level Security — עקרונות

RLS חובה בכל טבלה (ראו גם `CLAUDE.md` סעיף 3). כללי אצבע:

- **`jobs`**: לקוח רואה/עורך רק קריאות שהוא יצר. בעל מקצוע רואה קריאות בסטטוס `open`/`bidding` שבתחום/רדיוס שלו, ורואה קריאות שהוא זכה בהן. אדמין רואה הכל.
- **`bids`**: בעל מקצוע רואה/עורך רק את ההצעות שלו. לקוח רואה את כל ההצעות על הקריאות שלו (אבל לא יכול לערוך). אדמין רואה הכל.
- **`pro_profiles` / `verification_documents`**: בעל מקצוע רואה/עורך רק את הפרופיל שלו; המסמכים לא נגישים ללקוחות בשום מקרה (רק שדה `verification_status` נגזר, לא הקובץ עצמו). אדמין רואה הכל.
- **`commission_charges`**: בעל מקצוע רואה רק את שלו. אדמין רואה הכל. לקוח לא רואה בכלל (זה לא עניינו).

**איך זה נבדק (מ-Phase 1 והלאה):** `supabase/tests/rls_test.sql` — חבילת pgTAP שמורצת ב-`npm run db:test` וב-CI. היא מתחזה למשתמשים בדיוק כמו PostgREST (`request.jwt.claims` + מעבר ל-role `authenticated`, כי ה-role של הסשן הוא `postgres` שנושא `BYPASSRLS` והיה עובר דרך כל מדיניות), ומוכיחה בפועל את הטענות שבסעיף הזה. שתי בדיקות מבניות שומרות על העתיד: **כל** טבלה ב-`public` עם RLS מופעל, ו**כל** טבלה עם לפחות מדיניות אחת — טבלה עם RLS ובלי מדיניות היא חור שקט שנראה מאובטח ומחזיר אפס שורות.

כלל עבודה: כל טבלה חדשה מקבלת מדיניות RLS **וגם** בדיקה בקובץ הזה, באותו PR.

## 5. Realtime — מה רץ בזמן אמת

Supabase Realtime על גבי Postgres Changes + Broadcast:

| תרחיש | מנגנון |
|---|---|
| הצעות חדשות מגיעות למסך הלקוח | Postgres Changes subscription על `bids` מסונן ל-`job_id` |
| בעל מקצוע רואה קריאה חדשה בפיד | Postgres Changes על `jobs` (סטטוס `open`) + סינון בצד קליינט לפי רדיוס (או שאילתת PostGIS periodical) |
| מיקום חי של בעל מקצוע בדרך ("דוד בדרך אליך") | Broadcast channel `job:<id>:location`, בעל המקצוע משדר lat/lng כל כמה שניות בזמן שהסטטוס `assigned`/`in_progress` |
| התראה על עדכון מחיר | Postgres Changes על `price_updates` |
| צ'אט | Postgres Changes על `messages` מסונן ל-`job_id` |

## 6. אינטגרציות חיצוניות

- **Google Maps Platform**: Maps JavaScript API (הצגת מפה), Places Autocomplete (שדה כתובת בפרסום קריאה), Geocoding API (הפיכת כתובת לקואורדינטות שנשמרות ב-`jobs.location`), Distance Matrix/Directions (ניווט לבעל מקצוע). דורש API key בצד קליינט עם הגבלת דומיין ב-Google Cloud Console.
- **Twilio** (דרך Supabase Auth Phone Provider): שליחת קוד OTP. דורש הקמת חשבון Twilio + מספר שולח (לבדוק אילו מגבלות חלות על שליחת SMS לישראל דרך Twilio בזמן ההקמה).
- **Supabase Storage**: buckets נפרדים ל-`job-media` (תמונות/וידאו/קול של קריאות), `verification-docs` (מסמכי אימות — פרטי, לא ציבורי), `profile-photos`, `price-update-photos`. מדיניות גישה per-bucket תואמת ל-RLS.

## 7. משתני סביבה (יעודכן בפועל ב-`.env.example` בריפו)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # שרת בלבד, לעולם לא בצד קליינט
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
TWILIO_ACCOUNT_SID=                # מוגדר בתוך Supabase Auth, לא בקוד שלנו ישירות
TWILIO_AUTH_TOKEN=
```

## 8. למה לא Prisma / למה לא backend נפרד

הוחלט (ראו שאלת ההבהרה עם המשתמש) על Supabase כדי לצמצם את כמות התשתית שצריך לבנות ולתחזק כפרויקט יחיד/צוות קטן. שימוש נוסף ב-Prisma מעל Supabase יוצר שני מקורות אמת לסכימה (migrations של Supabase מול Prisma schema) — נמנעים מזה. אם בעתיד יתברר שצריך backend נפרד (למשל עומס גבוה, לוגיקה מורכבת שלא מסתדרת טוב ב-Edge Functions), זו החלטה מודעת שדורשת עדכון של המסמך הזה, לא משהו שקלוד קוד מחליט תוך כדי עבודה.
