# design/screens — מדריך התייחסות

36 צילומי מסך אמיתיים, שנוצרו ישירות מקובץ העיצוב המקורי (`Handy Web.html`, Claude Design), אחד לכל מסך בפרוטוטייפ. אלה **התמונות שקלוד קוד צריך להסתכל עליהן** לפני שהוא בונה כל מסך — לא רק לקרוא את התיאור המילולי ב-`product-spec.md`.

## איך להשתמש בזה עם קלוד קוד

כשמתחילים שלב מ-`roadmap.md` שבונה מסך מסוים, מציינים לו במפורש את קובץ התמונה הרלוונטי, למשל:

> תבנה את מסך פרסום הקריאה. תסתכל על `design/screens/customer-2.1-post-job.png` לפני שאתה מתחיל — תשמור על אותה מבנה, ריווחים, וטון עיצובי (לא להעתיק פיקסל-פרפקט, אבל להישאר נאמן לעיצוב).

Claude Code יודע לקרוא תמונות ישירות (vision) — אין צורך לתאר את זה במילים.

## מפתח: קובץ → סעיף באפיון → שלב ב-roadmap

### לקוחות (Customer)

| קובץ                                      | מסך                    | הפניה ב-product-spec.md                                | שלב               |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------ | ----------------- |
| `customer-1.1-landing.png`                | 1.1 דף הבית ללקוחות    | product-spec.md §3.1                                   | Phase 2           |
| `customer-1.2-login-otp.png`              | 1.2 התחברות וקוד SMS   | product-spec.md §2 (Auth)                              | Phase 1           |
| `customer-2.1-post-job.png`               | 2.1 פרסום קריאה        | product-spec.md §3.2                                   | Phase 2           |
| `customer-2.2-compare-bids.png`           | 2.2 השוואת הצעות       | product-spec.md §3.3                                   | Phase 4           |
| `customer-3.1-tracking-chat.png`          | 3.1 מעקב + צ׳אט        | product-spec.md §3.4 (+ §3.5 price-update modal state) | Phase 4 / Phase 5 |
| `customer-4.1-summary-receipt-rating.png` | 4.1 סיכום, קבלה ודירוג | product-spec.md §3.6                                   | Phase 6           |
| `customer-5.1-my-account.png`             | 5.1 האזור האישי שלי    | product-spec.md §3.7                                   | Phase 2           |
| `customer-5.2-pro-public-profile.png`     | 5.2 פרופיל בעל מקצוע   | product-spec.md §3.8                                   | Phase 8           |
| `customer-5.3-category-page.png`          | 5.3 דף תחום שירות      | product-spec.md §3.8                                   | Phase 8           |

### בעלי מקצוע (Pro)

| קובץ                                  | מסך                          | הפניה ב-product-spec.md     | שלב               |
| ------------------------------------- | ---------------------------- | --------------------------- | ----------------- |
| `pro-1.1-landing.png`                 | 1.1 דף הבית לבעלי מקצוע      | product-spec.md §4.1        | Phase 3           |
| `pro-1.2-login.png`                   | 1.2 התחברות                  | product-spec.md §2 (Auth)   | Phase 1           |
| `pro-1.3-signup-verification.png`     | 1.3 הרשמה ואימות             | product-spec.md §4.2        | Phase 3           |
| `pro-1.4-onboarding.png`              | 1.4 Onboarding מודרך         | product-spec.md §4.2        | Phase 3           |
| `pro-2.1-dashboard.png`               | 2.1 דשבורד בית               | product-spec.md §4.7        | Phase 3 / Phase 4 |
| `pro-2.2-job-feed.png`                | 2.2 פיד קריאות               | product-spec.md §4.3        | Phase 3           |
| `pro-2.3-submit-bid.png`              | 2.3 הגשת הצעה                | product-spec.md §4.4        | Phase 4           |
| `pro-2.4-my-bids.png`                 | 2.4 ההצעות שלי               | product-spec.md §4.4 / §4.7 | Phase 4           |
| `pro-3.1-manage-job-price-update.png` | 3.1 ניהול עבודה + עדכון מחיר | product-spec.md §4.5        | Phase 5           |
| `pro-3.2-my-jobs.png`                 | 3.2 העבודות שלי              | product-spec.md §4.5 / §4.6 | Phase 5 / Phase 6 |
| `pro-4.1-earnings-wallet.png`         | 4.1 ארנק, הכנסות ועמלות      | product-spec.md §4.6        | Phase 6           |
| `pro-5.1-public-profile-edit.png`     | 5.1 הפרופיל הציבורי שלי      | product-spec.md §4.8        | Phase 8           |
| `pro-5.2-availability-settings.png`   | 5.2 זמינות, אזור ולוח זמנים  | product-spec.md §4.9        | Phase 3           |
| `pro-5.3-messages.png`                | 5.3 הודעות                   | product-spec.md §4.10       | Phase 4           |
| `pro-5.4-notifications.png`           | 5.4 התראות                   | product-spec.md §4.10       | Phase 4 / Phase 6 |
| `pro-5.5-help-center.png`             | 5.5 מרכז עזרה                | product-spec.md §4.11       | Phase 8           |

### תוכן ושיווק (Content/Marketing)

| קובץ                                      | מסך                      | הפניה ב-product-spec.md                                   | שלב     |
| ----------------------------------------- | ------------------------ | --------------------------------------------------------- | ------- |
| `content-6.1-about-how-it-works.png`      | 6.1 איך זה עובד / אודות  | product-spec.md §3.8                                      | Phase 8 |
| `content-6.2-pricing-guide.png`           | 6.2 מחירים ומדריך עלויות | product-spec.md §3.8                                      | Phase 8 |
| `content-6.3-faq.png`                     | 6.3 עזרה ושאלות נפוצות   | product-spec.md §3.8                                      | Phase 8 |
| `content-6.4-support-contact.png`         | 6.4 צור קשר ותמיכה       | product-spec.md §3.8                                      | Phase 8 |
| `content-6.5-terms-privacy.png`           | 6.5 תקנון ופרטיות        | (legal text — not detailed in spec, standard ToS/privacy) | Phase 8 |
| `content-6.6-blog-maintenance-guides.png` | 6.6 בלוג ומדריכי תחזוקה  | product-spec.md §3.8                                      | Phase 8 |
| `content-6.7-404-empty-states.png`        | 6.7 404 ומצבי ריק        | product-spec.md §3.8                                      | Phase 8 |

### ניהול (Admin)

| קובץ                             | מסך                  | הפניה ב-product-spec.md                     | שלב     |
| -------------------------------- | -------------------- | ------------------------------------------- | ------- |
| `admin-7.1-overview.png`         | 7.1 סקירה כללית      | product-spec.md §5.1 (+ §5.5 trust metrics) | Phase 7 |
| `admin-7.2-pro-approvals.png`    | 7.2 אישור בעלי מקצוע | product-spec.md §5.2                        | Phase 7 |
| `admin-7.3-jobs-management.png`  | 7.3 קריאות במערכת    | product-spec.md §5.3                        | Phase 7 |
| `admin-7.4-disputes-control.png` | 7.4 מחלוקות ובקרה    | product-spec.md §5.4                        | Phase 7 |

## הערה על מובייל

קובץ העיצוב המקורי כולל גם גרסת "מובייל-ווב" לכל מסך (טוגל בפינה הימנית העליונה של הפרוטוטייפ). כאן נלכדה רק גרסת הדסקטופ (1280px) כרפרנס עיקרי. אם תרצו גם את גרסאות המובייל כתמונות — תגידו ואפיק גם אותן באותו אופן.
