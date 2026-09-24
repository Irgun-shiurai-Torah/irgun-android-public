(function () {
  "use strict";

  const he = {
    "Torah, wherever you are.": "תורה, בכל מקום שבו אתם נמצאים.",
    "Live shiurim, thousands of recordings, powerful search, schedules and your personal Torah library — in one app.": "שיעורים חיים, אלפי הקלטות, חיפוש מתקדם, לוחות זמנים והספרייה האישית שלכם — הכל באפליקציה אחת.",
    "Browse Shiurim": "לעיון בשיעורים",
    "Watch Live": "צפייה בשידור חי",
    "Schedule": "לוח שיעורים",
    "Library": "ספרייה",
    "Account": "חשבון",
    "Filters": "מסננים",
    "Most Watched This Week": "הנצפים ביותר השבוע",
    "Most Watched This Month": "הנצפים ביותר החודש",
    "Most Watched All Time": "הנצפים ביותר בכל הזמנים",
    "Following Notifications": "התראות על מעקבים",
    "Following notifications": "התראות על מעקבים",
    "Receive a push notification on this app.": "קבלו התראת דחיפה באפליקציה הזו.",
    "Send an email when a new shiur matches one of your follows.": "קבלו אימייל כאשר שיעור חדש מתאים לאחד ממגידי השיעורים או הנושאים שאתם עוקבים אחריהם.",
    "Listen to collections owned by this account.": "האזינו לאוספים השייכים לחשבון זה.",
    "You are not following any speakers or topics yet.": "עדיין אינכם עוקבים אחרי מגידי שיעורים או נושאים.",
    "The player appears automatically around scheduled Boro Park and Flatbush shiurim. Direct access is always available below.": "הנגן מופיע אוטומטית בסמוך לזמני השיעורים המתוכננים בבורו פארק ובפלטבוש. גישה ישירה זמינה תמיד למטה.",
    "Manage your Irgun Shiurai Torah account.": "ניהול החשבון שלכם באירגון שיעורי תורה.",
    "Back to Live": "חזרה לשידור חי",
    "← Back to Live": "חזרה לשידור חי",
    "After connecting": "לאחר החיבור",
    "Upcoming shiurim": "שיעורים קרובים",
    "Premium collections": "אוספי פרימיום",
    "Sponsor Torah": "הקדשת לימוד התורה",
    "Donate or dedicate": "תרומה או הקדשה",
    "Your Library": "הספרייה שלכם",
    "Likes & history": "לייקים והיסטוריה",
    "Live Now": "בשידור חי עכשיו",
    "Next Shiur": "השיעור הבא",
    "View live page": "לעמוד השידור החי",
    "Upcoming Shiurim": "שיעורים קרובים",
    "Full schedule": "לוח מלא",
    "Trending Shiurim": "שיעורים פופולריים",
    "This Week": "השבוע",
    "This Month": "החודש",
    "Latest Shiurim": "השיעורים החדשים",
    "Browse all": "הצגת הכל",
    "Listen & Watch Live": "האזנה וצפייה בשידור חי",
    "No scheduled stream is live right now.": "אין כרגע שידור חי מתוכנן.",
    "You can still open either recurring Vimeo event directly.": "עדיין ניתן לפתוח ישירות כל אחד משידורי Vimeo הקבועים.",
    "Open Live Stream": "פתיחת שידור חי",
    "Listen Live By Phone": "האזנה בשידור חי בטלפון",
    "All locations": "כל המקומות",
    "Listen Afterwards": "האזנה לאחר מכן",
    "Main Line": "הקו הראשי",
    "Flatbush Recordings": "הקלטות פלטבוש",
    "Original Flyers": "המודעות המקוריות",
    "PREMIUM TORAH AUDIO": "אודיו תורני פרימיום",
    "Purchase once and listen from your Irgun account. Purchased collections stay private and are streamed through protected access.": "רוכשים פעם אחת ומאזינים מתוך חשבון אירגון. האוספים שנרכשו נשארים פרטיים ומושמעים בגישה מאובטחת.",
    "Sign in before purchasing": "התחברו לפני הרכישה",
    "Your purchase is tied securely to your Irgun account.": "הרכישה מחוברת באופן מאובטח לחשבון אירגון שלכם.",
    "Buy Securely": "רכישה מאובטחת",
    "Coming Soon": "בקרוב",
    "Details": "פרטים",
    "Your Audio": "האודיו שלכם",
    "Protected personal listening": "האזנה אישית מוגנת",
    "Secure streaming": "הזרמה מאובטחת",
    "Donate & Sponsor Torah Learning": "תרומה והקדשת לימוד התורה",
    "Donate to Irgun": "תרומה לאירגון",
    "Sponsor Torah Learning": "הקדשת לימוד התורה",
    "Donate Securely": "תרומה מאובטחת",
    "Why the secure website form?": "למה טופס האתר המאובטח?",
    "Alternate secure card option (Cardknox)": "אפשרות כרטיס מאובטחת נוספת (Cardknox)",
    "Your Purchases": "הרכישות שלכם",
    "Browse Store": "לעיון בחנות",
    "Manage on Website": "ניהול באתר",
    "TORAH • LIVE • ON DEMAND": "תורה • חי • לפי דרישה",
    "LIVE & NEXT": "חי והבא",
    "COMING UP": "בקרוב",
    "POPULAR NOW": "פופולרי עכשיו",
    "NEW": "חדש",
    "SUPPORT TORAH": "תמיכה בתורה",
    "LIVE TORAH": "תורה בשידור חי",
    "PHONE": "טלפון",

    "The live player appears here during a scheduled shiur.": "נגן השידור החי יופיע כאן בזמן שיעור מתוכנן.",
    "Loading the live schedule…": "טוען את לוח השידורים החיים…",
    "In case the schedule is incorrect, you can still open either live stream directly.": "אם יש טעות בלוח הזמנים, עדיין ניתן לפתוח ישירות כל אחד מהשידורים החיים.",
    "Manual live access": "גישה ידנית לשידור חי",
    "Donate securely with Stripe without leaving the Irgun website.": "תרמו בצורה מאובטחת באמצעות Stripe מבלי לצאת מאתר אירגון שיעורי תורה.",
    "Audio shiurim you purchased for secure online listening.": "שיעורי אודיו שרכשתם להאזנה מאובטחת באתר.",
    "Purchase once and the collection stays in your Irgun account.": "רוכשים פעם אחת, והאוסף נשאר בחשבון אירגון שלכם.",
    "Personal use only.": "לשימוש אישי בלבד.",
    "Purchased audio is licensed only to the purchaser. It may not be copied, recorded, forwarded, shared, redistributed, posted, transferred, or given to another person. These restrictions apply under applicable copyright law and according to the halachic terms under which Irgun Shiurai Torah provides access.": "האודיו שנרכש מיועד לשימושו האישי של הרוכש בלבד. אסור להעתיק, להקליט, להעביר, לשתף, להפיץ, לפרסם, למסור או לתת אותו לאדם אחר. הגבלות אלו חלות הן על פי ההלכה ותנאי השימוש של אירגון שיעורי תורה והן על פי דיני זכויות היוצרים החלים.",
    "Continue to Secure Payment": "המשך לתשלום מאובטח",
    "Change amount or details": "שינוי סכום או פרטים",
    "Donate securely": "תרומה מאובטחת",
    "Included PDF downloads": "קובצי PDF מצורפים להורדה",
    "View": "צפייה",
    "Download": "הורדה",
    "Description": "תיאור",
    "Hide description": "הסתר תיאור",

    "Monthly charge day": "יום החיוב החודשי",
    "Stripe will charge on this day each month. If the date has already passed this month, the first charge will be next month. For shorter months, Stripe uses the last available day.": "Stripe יחייב ביום זה בכל חודש. אם היום שנבחר כבר עבר בחודש הנוכחי, החיוב הראשון יהיה בחודש הבא. בחודשים קצרים יותר Stripe יחייב ביום האחרון הקיים בחודש.",
    "Other amount": "סכום אחר",
    "Updating secure payment amount...": "מעדכן את סכום התשלום המאובטח...",
    "Preparing secure payment...": "מכין תשלום מאובטח...",
    "Please choose a monthly charge day.": "נא לבחור יום חיוב חודשי.",
    "Could not update secure payment.": "לא ניתן לעדכן את התשלום המאובטח.",


    "Irgun Audio Collections": "אוספי האודיו של אירגון שיעורי תורה",
    "Purchase Audio Shiurim": "רכישת שיעורי אודיו",
    "Available now": "זמין כעת",
    "Listen now": "האזנה עכשיו",
    "Sign in to purchase": "התחברו כדי לרכוש",
    "Purchase setup pending": "מערכת הרכישה בהכנה",
    "Purchase access": "רכישת גישה",
    "Price to be announced": "המחיר יפורסם בהמשך",
    "Digital listening access": "גישה דיגיטלית להאזנה",
    "track ready": "רצועה זמינה",
    "tracks ready": "רצועות זמינות",
    "Now playing": "מתנגן כעת",
    "Choose a track": "בחרו רצועה",
    "Audio tracks are being prepared.": "רצועות האודיו בהכנה.",
    "Bookmark this spot": "שמור סימניה במקום הזה",
    "Go to bookmark": "חזור לסימניה",
    "Your place is saved automatically.": "המקום שבו עצרת נשמר אוטומטית.",
    "Remaining": "נשאר",
    "Bookmark saved at": "הסימניה נשמרה ב־",
    "Resumed from": "המשך מהמקום",
    "Press Play to continue.": "לחץ על הפעלה כדי להמשיך.",
    "Finished. Your saved resume point was cleared.": "ההקלטה הסתיימה. נקודת ההמשך נשמרה כהתחלה.",
    "Playback could not continue. Please choose the track again.": "ההשמעה הופסקה. נא לבחור שוב את הרצועה.",
    "Preparing secure seekable playback...": "מכין השמעה מאובטחת עם אפשרות דילוג...",
    "Could not start playback": "לא ניתן להתחיל את ההשמעה",
    "Protected playback URL was not returned": "קישור ההשמעה המאובטח לא התקבל",
    "Returned to bookmark": "חזרת לסימניה",
    "The original Google Drive file is never shared.": "קובץ Google Drive המקורי אינו נחשף.",
    "collection available": "אוסף זמין",
    "collections available": "אוספים זמינים",
    "More collections are being prepared": "אוספים נוספים בהכנה",
    "The private paid-audio Drive folder still needs to be connected. The catalog is visible, but purchases stay disabled until the audio is connected.": "עדיין צריך לחבר את תיקיית האודיו הפרטית ב-Google Drive. הקטלוג מוצג, אך הרכישה תישאר כבויה עד לחיבור האודיו.",
    "Payment received. Your audio collection is now available here and in My Account.": "התשלום התקבל. אוסף האודיו זמין כעת כאן ובחשבון שלי.",
    "Secure Purchase": "רכישה מאובטחת",
    "Preparing secure payment...": "מכין תשלום מאובטח...",
    "Could not start purchase": "לא ניתן להתחיל את הרכישה",
    "Secure payment form could not load": "טופס התשלום המאובטח לא נטען",
    "Could not load payment form": "לא ניתן לטעון את טופס התשלום",
    "Could not start payment": "לא ניתן להתחיל את התשלום",
    "Processing...": "מעבד...",
    "Payment could not be completed": "לא ניתן להשלים את התשלום",
    "Pay": "שלם",
    "securely": "באופן מאובטח",

    "Paid Shiurim": "שיעורים בתשלום",
    "Purchased Shiurim": "שיעורים שנרכשו",
    "Loading purchased shiurim...": "טוען שיעורים שנרכשו...",
    "You have not purchased any shiurim yet.": "עדיין לא רכשתם שיעורים.",
    "Browse Paid Shiurim": "לעיון בשיעורים בתשלום",
    "Purchased": "נרכש",
    "Listen": "האזנה",
    "Temporarily unavailable": "לא זמין כרגע",
    "Unable to load purchased shiurim.": "לא ניתן לטעון את השיעורים שנרכשו.",
    "Recurring Donations": "תרומות חודשיות",
    "Manage monthly Stripe donations made while signed in to this account.": "ניהול תרומות חודשיות ב-Stripe שנעשו בזמן שהייתם מחוברים לחשבון זה.",
    "Manage monthly donations.": "ניהול תרומות חודשיות.",
    "Loading recurring donations...": "טוען תרומות חודשיות...",
    "You have no monthly Stripe donations in this account yet.": "עדיין אין בחשבון זה תרומות חודשיות דרך Stripe.",
    "Make a monthly donation": "תרומה חודשית",
    "per month": "לחודש",
    "Active": "פעיל",
    "Canceled": "בוטל",
    "Cancellation scheduled": "הביטול נקבע",
    "Cancellation confirmed by Stripe": "הביטול אושר על ידי Stripe",
    "No further charges": "לא יהיו חיובים נוספים",
    "Ends": "מסתיים",
    "Charges on the": "חיוב ביום",
    "Payment issue": "בעיה בתשלום",
    "Payment incomplete": "התשלום לא הושלם",
    "Pending": "ממתין",
    "No more charges after": "לא יהיו חיובים נוספים לאחר",
    "Next monthly charge": "החיוב החודשי הבא",
    "Ended": "הסתיים",
    "Cancel monthly donation": "ביטול התרומה החודשית",
    "Keep monthly donation": "השארת התרומה החודשית פעילה",
    "Cancel this monthly donation? You will not be charged again after the current monthly period.": "לבטל את התרומה החודשית? לא תחויבו שוב לאחר סיום התקופה החודשית הנוכחית.",
    "Cancel this monthly donation? Stripe will not make another monthly charge. The donation remains active only through the period already covered.": "לבטל את התרומה החודשית? Stripe לא יבצע חיוב חודשי נוסף. התרומה תישאר פעילה רק עד סוף התקופה שכבר שולמה.",
    "Could not cancel this monthly donation.": "לא ניתן לבטל את התרומה החודשית.",
    "Could not keep this monthly donation active.": "לא ניתן להשאיר את התרומה החודשית פעילה.",
    "Unable to load recurring donations.": "לא ניתן לטעון את התרומות החודשיות.",
    "Sign in before donating to manage and cancel this recurring donation from My Account.": "התחברו לפני התרומה כדי לנהל ולבטל את התרומה החודשית מתוך החשבון שלי.",
    "This monthly donation will appear in": "התרומה החודשית תופיע בתוך",
    "where you can cancel future charges anytime.": "ושם תוכלו לבטל חיובים עתידיים בכל עת.",

    "Upcoming Lecture": "השיעור הקרוב",
    "More Upcoming Shiurim": "שיעורים נוספים בקרוב",
    "All": "הכל",
    "Other": "אחר",
    "Listen & Watch Live": "האזנה וצפייה בשידור חי",
    "The schedule below is typed automatically from the latest Irgun notices.": "לוח הזמנים נכתב ומתעדכן אוטומטית מתוך המודעות העדכניות של אירגון שיעורי תורה.",
    "Reading the latest schedule…": "קורא את לוח הזמנים העדכני…",
    "Checking the live schedule…": "בודק את לוח השידורים החיים…",
    "Upcoming Live Shiurim": "שיעורים קרובים בשידור חי",
    "Upcoming Live Lecture": "השיעור הבא בשידור חי",
    "The live player appears only during the scheduled shiur and switches automatically between Boro Park and Flatbush.": "נגן השידור החי מופיע רק בזמן השיעור המתוכנן ומתחלף אוטומטית בין בורו פארק לפלטבוש.",
    "The live player will appear here automatically when the scheduled shiur begins.": "נגן השידור החי יופיע כאן אוטומטית כאשר יתחיל השיעור המתוכנן.",
    "No upcoming Boro Park or Flatbush live lecture is listed yet.": "עדיין לא מופיע שיעור קרוב בשידור חי מבורו פארק או פלטבוש.",
    "There are no upcoming shiurim in the current schedule.": "אין כרגע שיעורים קרובים בלוח הזמנים.",
    "No additional upcoming lectures found for this location.": "לא נמצאו שיעורים נוספים קרובים במקום זה.",
    "No upcoming lectures were found in the current schedule files.": "לא נמצאו שיעורים קרובים במודעות לוח הזמנים הנוכחיות.",
    "The typed schedule is temporarily unavailable.": "לוח הזמנים הכתוב אינו זמין כרגע.",
    "Original schedule notices": "המודעות המקוריות של לוח הזמנים",
    "These are available as a temporary backup while the automatic schedule reader updates.": "המודעות המקוריות זמינות כגיבוי זמני בזמן שהמערכת האוטומטית מעדכנת את לוח הזמנים.",

    "Profile": "פרופיל",
    "Included PDF downloads": "קובצי PDF מצורפים להורדה",
    "Settings": "הגדרות",
    "Push Notifications": "התראות דחיפה",
    "Email Notifications": "התראות באימייל",
    "Loading notification settings...": "טוען הגדרות התראות...",
    "Notification settings saved.": "הגדרות ההתראות נשמרו.",
    "Notification settings are ready.": "הגדרות ההתראות מוכנות.",
    "Could not load notification settings.": "לא ניתן לטעון את הגדרות ההתראות.",
    "Could not update push notifications.": "לא ניתן לעדכן התראות דחיפה.",
    "Could not update email notifications.": "לא ניתן לעדכן התראות באימייל.",
    "Requesting browser notification permission...": "מבקש הרשאה להתראות בדפדפן...",
    "browser push": "התראות דפדפן",
    "email": "אימייל",
    "Browser push is not configured yet.": "התראות דפדפן עדיין אינן מוגדרות.",
    "Email notifications are not configured yet.": "התראות אימייל עדיין אינן מוגדרות.",
    "This browser does not support push notifications.": "הדפדפן הזה אינו תומך בהתראות דחיפה.",
    "Notifications are blocked in this browser. Allow them in the browser settings first.": "ההתראות חסומות בדפדפן הזה. יש לאפשר אותן תחילה בהגדרות הדפדפן.",
    "Push notifications are on in this browser.": "התראות הדחיפה פעילות בדפדפן הזה.",
    "Push notifications are off in this browser.": "התראות הדחיפה כבויות בדפדפן הזה.",
    "Choose how you want to hear about new shiurim from speakers and topics you follow.": "בחרו כיצד תרצו לקבל עדכונים על שיעורים חדשים ממגידי שיעורים ונושאים שאתם עוקבים אחריהם.",
    "Receive a notification in this browser.": "קבלו התראה בדפדפן הזה.",
    "Send an email when a new shiur matches a speaker or topic you follow.": "קבלו אימייל כאשר מתפרסם שיעור חדש ממגיד שיעור או בנושא שאתם עוקבים אחריו.",
    "Opens PayPal ↗": "פתיחת PayPal ↗",
    "Opens OJC ↗": "פתיחת OJC ↗",
    "{{videos}} videos • {{audio}} audio recordings": "{{videos}} שיעורי וידאו • {{audio}} הקלטות אודיו",
    "Match at {{time}}": "התאמה ב־{{time}}",
    "Irgun Shiurai Torah": "אירגון שיעורי תורה",
    "Home": "דף הבית",
    "Live": "שידור חי",
    "Video": "וידאו",
    "Videos": "סרטונים",
    "Audio": "אודיו",
    "Boro Park": "בורו פארק",
    "✓ Boro Park": "✓ בורו פארק",
    "Borough Park": "בורו פארק",
    "Flatbush": "פלטבוש",
    "✓ Flatbush": "✓ פלטבוש",
    "Williamsburg": "וויליאמסבורג",
    "Lakewood": "לייקווד",
    "Monsey": "מאנסי",
    "Catskill Summer": "קיץ בקטסקילס",
    "Skver Yerushalayim": "סקווירא ירושלים",
    "Daily Boro Park": "שיעור יומי בבורו פארק",
    "Boro Park (Daily Shiurim)": "בורו פארק (שיעורים יומיים)",
    "Rabbi Zev Smith": "הרב זאב סמיט",
    "Rabbi Elozer Nissen Rubin (Parsha)": "הרב אלעזר ניסן רובין (פרשה)",
    "Catskill Mountains (Summer Shiurim)": "הרי הקטסקיל (שיעורי קיץ)",
    "Lakewood (Chol Hamoed Shiurim)": "לייקווד (שיעורי חול המועד)",
    "Yerushalayim (Skvere)": "ירושלים (סקווירא)",
    "Direct:": "ישיר:",
    "Rav Zev Smith": "הרב זאב סמיט",
    "Rav Elozer Nissen Rubin Parsha": "פרשה – הרב אלעזר ניסן רובין",
    "Lakewood Chol Hamoed": "לייקווד – חול המועד",
    "Parsha - Rav Elozer Nissen Rubin": "פרשה – הרב אלעזר ניסן רובין",
    "5787 - Rav Zev Smith Shiurim": "תשפ\"ז – שיעורי הרב זאב סמיט",
    "5786 Sunday - Rav Zev Smith": "תשפ\"ו יום ראשון – הרב זאב סמיט",
    "5785 Sunday - Rav Zev Smith": "תשפ\"ה יום ראשון – הרב זאב סמיט",
    "5784 & Older Rav Zev Smith": "תשפ\"ד ומוקדם יותר – הרב זאב סמיט",
    "5784 & Older Rav Zev Smith Shiurim": "שיעורי הרב זאב סמיט – תשפ\"ד ומוקדם יותר",
    "5786 Daily & Chol Hamoed": "תשפ\"ו יומי וחול המועד",
    "5785 Daily & Chol Hamoed": "תשפ\"ה  יומי וחול המועד",
    "5786 Summer Flatbush": "תשפ\"ו  קיץ פלטבוש",
    "5786 Summer Flatbush Shiurim": "שיעורי קיץ פלטבוש תשפ\"ו",
    "5785 Summer Flatbush": "תשפ\"ה קיץ פלטבוש",
    "5785 Summer Flatbush Shiurim": "שיעורי קיץ פלטבוש תשפ\"ה",
    "5784 & Older Summer Flatbush": "תשפ\"ד ומוקדם יותר – קיץ פלטבוש",
    "5784 & Older Summer Flatbush Shiurim": "שיעורי קיץ פלטבוש – תשפ\"ד ומוקדם יותר",
    "5784 & Older Daily Yiddish": "תשפ\"ד ומוקדם יותר – שיעור יומי ביידיש",
    "5784 & Older Daily Yiddish Shiurim": "שיעורים יומיים ביידיש – תשפ\"ד ומוקדם יותר",
    "Daily Yiddish Shiurim 5786": "שיעורים יומיים ביידיש תשפ\"ו",
    "Daily Yiddish Shiurim - 5786": "שיעורים יומיים ביידיש – תשפ\"ו",
    "I.S.T. Daily Yiddish Shiurim - 5785": "שיעורים יומיים ביידיש – תשפ\"ה",
    "Daily Yiddish Shiurim 5785": "שיעורים יומיים ביידיש תשפ\"ה",
    "Daily Yiddish Shiurim - 5785": "שיעורים יומיים ביידיש – תשפ\"ה",
    "Daily Yiddish Shiurim from 5784 and older": "שיעורים יומיים ביידיש – תשפ\"ד ומוקדם יותר",
    "Rav Zev Smith Shiurim 5786": "שיעורי הרב זאב סמיט תשפ\"ו",
    "Rav Zev Smith Shiurim - 5786": "שיעורי הרב זאב סמיט – תשפ\"ו",
    "Rav Zev Smith Shiurim 5785": "שיעורי הרב זאב סמיט תשפ\"ה",
    "Rav Zev Smith Shiurim - 5785": "שיעורי הרב זאב סמיט – תשפ\"ה",
    "Rav Zev Smith Shiurim from 5784 and older": "שיעורי הרב זאב סמיט – תשפ\"ד ומוקדם יותר",
    "Rav Eluzer Nissen Rubin - 5785": "הרב אלעזר ניסן רובין – תשפ\"ה",
    "Rav Elozer Nissen Rubin - 5785": "הרב אלעזר ניסן רובין – תשפ\"ה",
    "Lakewood Shiurim": "שיעורי לייקווד",
    "Summer Flatbush Shiurim from 5784 and older": "שיעורי קיץ פלטבוש – תשפ\"ד ומוקדם יותר",
    "Shiurim": "שיעורים",
    "Schedule": "לוח השיעורים",
    "schedule": "לוח השיעורים",
    "Donate": "תרומה",
    "Contact": "יצירת קשר",
    "Sign In": "כניסה",
    "Logout": "התנתקות",
    "My Account": "החשבון שלי",
    "Name": "שם",
    "Name:": "שם:",
    "Email": "אימייל",
    "Email:": "אימייל:",
    "Password": "סיסמה",
    "Phone": "טלפון",
    "Phone Number": "מספר טלפון",
    "Subject": "נושא",
    "Message": "הודעה",
    "Send Message": "שליחת הודעה",
    "Loading...": "טוען...",
    "Loading library...": "טוען את ספריית השיעורים...",
    "Loading shiurim...": "טוען שיעורים...",
    "Loading more shiurim...": "טוען שיעורים נוספים...",
    "Loading audio recordings...": "טוען הקלטות אודיו...",
    "Loading latest shiurim...": "טוען את השיעורים האחרונים...",
    "Daily Torah Learning • Live Broadcasts • Video Archive": "לימוד תורה יומי • שידורים חיים • ארכיון שיעורים",
    "LIVE • VIDEO": "שידור חי • שיעורי וידאו",
    "© Irgun Shiurai Torah": "© אירגון שיעורי תורה",
    "Torah Learning": "לימוד תורה",
    "Bringing Torah to Jews": "הפצת תורה",
    "Worldwide": "ברחבי העולם",
    "Watch Live": "לצפייה בשידור חי",
    "Browse Shiurim": "לעיון בשיעורים",
    "Watch live shiurim and browse thousands of recorded Torah lectures from anywhere in the world.": "שיעורי תורה בשידור חי ואלפי שיעורים מוקלטים — מכל מקום בעולם.",
    "Live Shiurim": "שיעורים בשידור חי",
    "Choose your location to watch live Torah broadcasts.": "בחרו מיקום לצפייה בשידור החי.",
    "Watch live broadcasts from your preferred location.": "צפו בשידורים חיים מהמיקום המועדף עליכם.",
    "Boro Park Live": "שידור חי מבורו פארק",
    "Flatbush Live": "שידור חי מפלטבוש",
    "Watch Boro Park Live": "לצפייה בשידור מבורו פארק",
    "Watch Flatbush Live": "לצפייה בשידור מפלטבוש",
    "Boro Park Shiurim are held at:": "שיעורי בורו פארק מתקיימים בכתובת:",
    "Flatbush Shiurim are held at:": "שיעורי פלטבוש מתקיימים בכתובת:",
    "Looking for times? Check the": "לזמני השיעורים, היכנסו אל",
    "in the top menu.": "שבתפריט העליון.",
    "Boro Park Shiurim": "שיעורי בורו פארק",
    "Flatbush Shiurim": "שיעורי פלטבוש",
    "Watch the live broadcast from Boro Park.": "צפו בשידור החי מבורו פארק.",
    "Watch the live broadcast from Flatbush.": "צפו בשידור החי מפלטבוש.",
    "Listen Live By Phone": "האזנה חיה בטלפון",
    "Live via Phone": "האזנה בשידור חי בטלפון",
    "Shiur Playback": "השמעת שיעורים מוקלטים",
    "Recorded shiurim available by phone:": "ניתן להאזין לשיעורים מוקלטים בטלפון:",
    "Missed a shiur? Listen to recorded shiurim by phone:": "פספסתם שיעור? ניתן להאזין לשיעורים מוקלטים בטלפון:",
    "Choose an option below.": "בחרו באחת מהאפשרויות הבאות.",
    "Boro Park or Williamsburg:": "בורו פארק או וויליאמסבורג:",
    "Boro Park or Williamsburg": "בורו פארק או וויליאמסבורג",
    "Press": "הקישו",
    "Then press": "ואז הקישו",
    "Select:": "בחרו:",
    "Flatbush Listen Afterwards:": "הקלטות מפלטבוש:",
    "Direct number for Flatbush recorded shiurim.": "מספר ישיר להאזנה לשיעורים מוקלטים מפלטבוש.",
    "Main Line:": "הקו הראשי:",
    "Menu Options:": "אפשרויות בתפריט:",
    "Latest Shiurim": "שיעורים חדשים",
    "Recently added Torah shiurim.": "שיעורי תורה שנוספו לאחרונה.",
    "Video Library": "ספריית השיעורים",
    "Torah Video Library": "ספריית שיעורי התורה",
    "Torah Shiurim Library": "ספריית שיעורי התורה",
    "Video Shiurim": "שיעורי וידאו",
    "Audio Shiurim": "שיעורי אודיו",
    "Free Audio Shiurim": "שיעורי אודיו ללא תשלום",
    "Browse recorded shiurim and special series.": "עיינו בשיעורים מוקלטים ובסדרות נבחרות.",
    "Browse free Torah recordings by location and year.": "עיינו בהקלטות לפי מקום ושנה.",
    "Support Irgun Shiurai Torah": "תמכו באירגון שיעורי תורה",
    "Donate by Card": "תרומה בכרטיס",
    "Other payment methods": "אפשרויות תשלום נוספות",
    "Sponsor Online Learning": "הקדשת לימוד התורה",
    "Available Collections": "אוספים זמינים",
    "Coming Soon Collections": "אוספים בקרוב",
    "Available now": "זמין כעת",
    "More collections are being prepared": "אוספים נוספים בהכנה",
    "Help continue providing daily Torah learning and shiurim.": "עזרו לנו להמשיך להפיץ שיעורי תורה ולימוד יומי.",
    "PayPal Donation": "תרומה באמצעות PayPal",
    "Mail Donations": "תרומה בדואר",
    "Contact Us": "יצירת קשר",
    "Get in touch with Irgun Shiurai Torah.": "נשמח לעמוד לרשותכם.",
    "For questions, information, or support, please contact us.": "לשאלות, מידע או תמיכה, ניתן לפנות אלינו.",
    "Send a Message": "שליחת הודעה",
    "Have a question? We would love to hear from you.": "יש לכם שאלה? נשמח לשמוע מכם.",
    "Contact Form": "טופס יצירת קשר",
    "Contact Irgun Shiurai Torah": "יצירת קשר עם אירגון שיעורי תורה",
    "Send us a message and we will get back to you.": "שלחו לנו הודעה ונשוב אליכם בהקדם.",
    "Shiurim Schedule": "לוח זמני השיעורים",
    "Coming Soon": "בקרוב",
    "This page is currently under construction.": "העמוד נמצא כעת בהכנה.",
    "New Torah content and features will be available soon.": "בקרוב יתווספו תכנים ותכונות חדשות.",
    "Login": "כניסה",
    "Sign in to access your account": "היכנסו לחשבון שלכם",
    "Forgot password?": "שכחתם את הסיסמה?",
    "Don't have an account?": "עדיין אין לכם חשבון?",
    "Create account": "הרשמה",
    "Create Account": "יצירת חשבון",
    "Already have an account?": "כבר נרשמתם?",
    "Manage your Irgun Shiurai Torah account": "ניהול החשבון שלכם באירגון שיעורי תורה",
    "Edit Profile": "עריכת פרטים",
    "New Password": "סיסמה חדשה",
    "Save Changes": "שמירת שינויים",
    "My Likes": "שיעורים שאהבתי",
    "Watch Later": "לצפייה מאוחרת",
    "Watch History": "היסטוריית צפייה והאזנה",
    "Clear History": "מחיקת ההיסטוריה",
    "Loading liked shiurim...": "טוען את השיעורים שאהבתם...",
    "Loading saved shiurim...": "טוען את השיעורים השמורים...",
    "Loading watch history...": "טוען את ההיסטוריה...",
    "Your name": "השם שלכם",
    "Leave empty to keep current password": "השאירו ריק כדי לשמור את הסיסמה הקיימת",
    "All Series": "כל הסדרות",
    "All Locations": "כל המקומות",
    "All Years": "כל השנים",
    "Speakers": "מגידי שיעורים",
    "All Speakers": "כל מגידי השיעורים",
    "Topics": "נושאים",
    "All Topics": "כל הנושאים",
    "All Languages": "כל השפות",
    "languages selected": "שפות נבחרו",
    "English": "English",
    "Yiddish": "יידיש",
    "Sunday Shiurim": "שיעורי יום ראשון",
    "Daily Shiurim": "שיעורים יומיים",
    "Parsha": "פרשה",
    "None selected": "לא נבחרו אפשרויות",
    "speakers selected": "מגידי שיעורים נבחרו",
    "topics selected": "נושאים נבחרו",
    "Search shiurim...": "חיפוש לפי שם, מגיד שיעור או נושא...",
    "Search title, topic or speaker...": "חיפוש לפי כותרת, נושא או מגיד שיעור...",
    "Search inside shiur content...": "חיפוש בתוך תוכן השיעור...",
    "Search shiur content, title, topic or speaker...": "חיפוש בתוכן השיעור, כותרת, נושא או מגיד שיעור...",
    "Title / Topic / Speaker": "כותרת / נושא / מגיד שיעור",
    "Title": "כותרת",
    "Shiur Content": "תוכן השיעור",
    "Searching shiur content...": "מחפש בתוך תוכן השיעור...",
    "Enter at least 2 characters to search shiur content.": "יש להזין לפחות 2 תווים כדי לחפש בתוך תוכן השיעור.",
    "Shiur content search is available for Vimeo videos only.": "חיפוש בתוך תוכן השיעור זמין רק לשיעורי וידאו עם כתוביות Vimeo.",
    "Search videos...": "חיפוש שיעורי וידאו...",
    "Search audio recordings...": "חיפוש שיעורי אודיו...",
    "Watch": "צפייה",
    "Listen": "האזנה",
    "Resume": "המשך צפייה",
    "Resume Listening": "המשך האזנה",
    "Watch Again": "צפייה מחדש",
    "Listen Again": "האזנה מחדש",
    "Remove": "הסרה",
    "Completed": "הושלם",
    "Watch later": "לצפייה מאוחרת",
    "Download": "הורדה",
    "Share": "שיתוף",
    "Likes": "אהבתי",
    "Shiur Audio": "הקלטת השיעור",
    "Now Playing": "מתנגן כעת",
    "Close player": "סגירת הנגן",
    "Download Video (Vimeo)": "הורדת וידאו מ־Vimeo",
    "Download Video (Drive)": "הורדת וידאו מ־Drive",
    "Download Audio": "הורדת אודיו",
    "Like this shiur?": "אהבתם את השיעור?",
    "Sign in to like this shiur and see it in My Likes.": "היכנסו כדי לשמור את השיעור ברשימת “אהבתי”.",
    "Back to Video Library": "חזרה לספריית השיעורים",
    "Streaming Audio": "האזנה באודיו",
    "Loading Shiur...": "טוען את השיעור...",
    "Listen Audio": "האזנה לאודיו",
    "Comments": "תגובות",
    "Comments (": "תגובות (",
    "Leave a comment about this shiur...": "כתבו תגובה על השיעור...",
    "Post Comment": "פרסום תגובה",
    "Loading comments...": "טוען תגובות...",
    "Related Shiurim": "שיעורים נוספים בסדרה",
    "Dismiss": "סגירה",
    "Sign in required": "יש להיכנס לחשבון",
    "Sign in to perform this action.": "יש להיכנס לחשבון כדי לבצע פעולה זו.",
    "Load More": "טעינת שיעורים נוספים",
    "← Back Home": "חזרה לדף הבית",
    "← Back to Home": "חזרה לדף הבית",
    "Unable to load shiurim. Please refresh.": "לא הצלחנו לטעון את השיעורים. נסו לרענן את הדף.",
    "Unable to load audio recordings. Please refresh.": "לא הצלחנו לטעון את הקלטות האודיו. נסו לרענן את הדף.",
    "No recordings matched your search.": "לא נמצאו הקלטות התואמות לחיפוש.",
    "No shiurim matched your search.": "לא נמצאו שיעורים התואמים לחיפוש.",
    "Untitled shiur": "שיעור ללא כותרת",
    "No description available.": "לא נוסף תיאור לשיעור.",
    "No comments yet. Be the first to share your thoughts!": "עדיין אין תגובות. כתבו את התגובה הראשונה.",
    "No other shiurim in this series.": "אין שיעורים נוספים בסדרה זו.",
    "Unable to load comments.": "לא ניתן לטעון תגובות.",
    "Audio is not available for this shiur yet.": "הקלטת האודיו עדיין אינה זמינה לשיעור זה.",
    "Link copied to clipboard!": "הקישור הועתק.",
    "Share link copied to clipboard!": "קישור השיתוף הועתק.",
    "Audio stream not available for this shiur yet.": "הקלטת האודיו עדיין אינה זמינה לשיעור זה.",
    "Download links not available.": "קישורי ההורדה אינם זמינים כרגע.",
    "Vimeo video download unavailable for this shiur.": "הורדת הווידאו מ־Vimeo אינה זמינה לשיעור זה.",
    "This download format is not available yet.": "אפשרות הורדה זו עדיין אינה זמינה.",
    "Sign in to save this shiur to your Watch Later list.": "היכנסו כדי לשמור את השיעור לצפייה מאוחרת.",
    "Sign in to comment": "היכנסו כדי להגיב",
    "Please sign in to leave a comment on this shiur.": "היכנסו כדי לכתוב תגובה על השיעור.",
    "Are you sure you want to delete this comment?": "למחוק את התגובה? לא ניתן לבטל פעולה זו.",
    "You can only edit your own comments.": "ניתן לערוך רק תגובות שכתבתם.",
    "You can only delete your own comments.": "ניתן למחוק רק תגובות שכתבתם.",
    "Failed to post comment. Please try again.": "לא הצלחנו לפרסם את התגובה. נסו שוב.",
    "Failed to update comment.": "לא הצלחנו לעדכן את התגובה.",
    "Failed to delete comment.": "לא הצלחנו למחוק את התגובה.",
    "Network error.": "אירעה שגיאת רשת.",
    "Network error. Please try again.": "אירעה שגיאת רשת. נסו שוב.",
    "Your watch history is empty. Start a shiur and it will appear here.": "עדיין אין היסטוריית צפייה או האזנה. התחילו שיעור והוא יופיע כאן.",
    "Unable to load watch history.": "לא הצלחנו לטעון את ההיסטוריה.",
    "Clear your entire watch history? This cannot be undone.": "למחוק את כל היסטוריית הצפייה וההאזנה? לא ניתן לבטל פעולה זו.",
    "Could not clear your watch history.": "לא הצלחנו למחוק את ההיסטוריה.",
    "Could not remove this shiur from your history.": "לא הצלחנו להסיר את השיעור מההיסטוריה.",
    "No liked shiurim yet.": "עדיין לא סימנתם שיעורים שאהבתם.",
    "No saved shiurim yet.": "עדיין לא שמרתם שיעורים לצפייה מאוחרת.",
    "Unable to load liked shiurim.": "לא הצלחנו לטעון את השיעורים שאהבתם.",
    "Unable to load watch later.": "לא הצלחנו לטעון את השיעורים שנשמרו לצפייה מאוחרת.",
    "Could not remove like. Please try again.": "לא הצלחנו להסיר את הסימון. נסו שוב.",
    "Could not remove from watch later. Please try again.": "לא הצלחנו להסיר את השיעור מצפייה מאוחרת. נסו שוב.",
    "Profile updated successfully!": "הפרטים עודכנו בהצלחה.",
    "Saving...": "שומר...",
    "Sending...": "שולח...",
    "Thank you! Your message was sent successfully.": "תודה! ההודעה נשלחה בהצלחה.",
    "Sorry, something went wrong.": "אירעה שגיאה.",
    "Could not send message. Please try again.": "לא הצלחנו לשלוח את ההודעה. נסו שוב.",
    "Logging in...": "מתחבר...",
    "Login successful!": "התחברתם בהצלחה.",
    "Login failed": "ההתחברות נכשלה",
    "Connection error": "שגיאת חיבור",
    "Connection error. Please try again.": "אירעה שגיאת חיבור. נסו שוב.",
    "Creating account...": "יוצר את החשבון...",
    "Creating...": "יוצר...",
    "Account created! Redirecting...": "החשבון נוצר. מעביר אתכם...",
    "Registration failed": "ההרשמה נכשלה",
    "Recently watched": "נצפה לאחרונה",
    "Recently listened": "הושמע לאחרונה",
    "Video Library | Irgun Shiurai Torah": "ספריית שיעורי התורה | אירגון שיעורי תורה",
    "My Account | Irgun Shiurai Torah": "החשבון שלי | אירגון שיעורי תורה",
    "Login | Irgun Shiurai Torah": "כניסה | אירגון שיעורי תורה",
    "Create Account | Irgun Shiurai Torah": "יצירת חשבון | אירגון שיעורי תורה",
    "Contact | Irgun Shiurai Torah": "צור קשר | אירגון שיעורי תורה",
    "Schedule - Irgun Shiurai Torah": "לוח זמנים | אירגון שיעורי תורה",
    "Shiur | Irgun Shiurai Torah": "שיעור | אירגון שיעורי תורה",
    "Boro Park Shiurim | Irgun Shiurai Torah": "שיעורי בורו פארק | אירגון שיעורי תורה",
    "Flatbush Shiurim | Irgun Shiurai Torah": "שיעורי פלטבוש | אירגון שיעורי תורה",
    "Coming Soon | Irgun Shiurai Torah": "בקרוב | אירגון שיעורי תורה",
    "Video Series | Irgun Shiurai Torah": "סדרת וידאו | אירגון שיעורי תורה",
    "{{count}} shiurim available": "{{count}} שיעורים זמינים",
    "{{count}} audio recordings available": "{{count}} הקלטות אודיו זמינות",
    "Found {{count}} shiurim": "נמצאו {{count}} שיעורים",
    "Found {{count}} recordings": "נמצאו {{count}} הקלטות",
    "{{time}} watched": "צפייה: {{time}}",
    "{{time}} listened": "האזנה: {{time}}",
    "{{current}} of {{duration}}": "{{current}} מתוך {{duration}}",
    "Watched {{date}}": "נצפה בתאריך {{date}}",
    "Listened {{date}}": "הושמע בתאריך {{date}}",
    "All": "הכול",
    "All folders": "כל התיקיות",
    "All locations": "כל המקומות",
    "All years": "כל השנים",
    "All languages": "כל השפות",
    "All speakers": "כל מגידי השיעורים",
    "All topics": "כל הנושאים",
    "Listen later": "להאזנה מאוחרת",
    "locations selected": "מקומות נבחרו",
    "years selected": "שנים נבחרו",
    "Video or Audio": "וידאו או אודיו",
    "Secure Credit Card": "כרטיס אשראי מאובטח",
    "Shiurim Watched & Listened To": "צפיות והאזנות לשיעורים",
    "Shiurim Played": "שיעורים שהושמעו",
    "Shiurim watched and listened to": "צפיות והאזנות לשיעורים",
    "Edit": "עריכה",
    "Delete": "מחיקה",
    "Save": "שמירה",
    "Saved": "שמור",
    "Playlist": "ברשימה",
    "Cancel": "ביטול",
    "Deleting...": "מוחק...",
    "Video mode": "מצב וידאו",
    "Audio mode": "מצב אודיו",
    "Sort shiurim": "מיון שיעורים",
    "Newest": "החדשים ביותר",
    "Trending This Week": "הפופולריים השבוע",
    "Trending This Month": "הפופולריים החודש",
    "Most Watched & Listened": "הנצפים והמושמעים ביותר",
    "Trending Shiurim": "שיעורים פופולריים",
    "Most watched and listened to across the site.": "השיעורים הנצפים והמושמעים ביותר באתר.",
    "Trending period": "תקופת הפופולריות",
    "This Week": "השבוע",
    "This Month": "החודש",
    "Loading trending shiurim...": "טוען שיעורים פופולריים...",
    "Trending will appear as visitors watch and listen.": "כאן יופיעו השיעורים הפופולריים ככל שיצטברו צפיות והאזנות.",
    "Unable to load trending shiurim.": "לא ניתן לטעון את השיעורים הפופולריים.",
    "Popular in This Series": "פופולרי בסדרה זו",
    "Follow": "עקבו אחרי",
    "Following": "עוקבים אחרי",
    "Following & New": "מעקב ועדכונים",
    "Follow speaker or topic": "מעקב אחרי מגיד שיעור או נושא",
    "Sign in to follow": "יש להתחבר כדי לעקוב",
    "Sign in to follow speakers and topics.": "התחברו כדי לעקוב אחרי מגידי שיעורים ונושאים.",
    "Could not update this follow. Please try again.": "לא ניתן לעדכן את המעקב. נסו שוב.",
    "Speakers and topics you follow, plus their newest shiurim.": "מגידי השיעורים והנושאים שבחרתם לעקוב אחריהם, והשיעורים החדשים שלהם.",
    "New From Speakers & Topics You Follow": "חדש ממגידי השיעורים והנושאים שבמעקב",
    "Loading follows...": "טוען את רשימת המעקב...",
    "Loading new shiurim...": "טוען שיעורים חדשים...",
    "No followed speakers or topics yet.": "עדיין לא בחרתם מגידי שיעורים או נושאים למעקב.",
    "Follow a speaker or topic from a watch page.": "ניתן לעקוב אחרי מגיד שיעור או נושא מתוך עמוד השיעור.",
    "Speakers You Follow": "מגידי שיעורים שבמעקב",
    "Topics You Follow": "נושאים שבמעקב",
    "Unfollow": "הפסקת מעקב",
    "None yet": "עדיין אין",
    "No new shiurim from your follows yet.": "עדיין אין שיעורים חדשים מהמעקבים שלכם.",
    "Unable to load follows.": "לא ניתן לטעון את רשימת המעקב.",
    "View All Donation Options": "לכל אפשרויות התרומה",
    "Choose a donation method": "בחרו אמצעי תרומה",
    "Donation frequency": "תדירות התרומה",
    "How long should the monthly donation continue?": "לכמה זמן להמשיך את התרומה החודשית?",
    "Recurring donation length": "משך התרומה החודשית",
    "Continue until canceled": "להמשיך עד לביטול",
    "For a set number of months": "למספר חודשים מוגדר",
    "Number of months": "מספר החודשים",
    "months": "חודשים",
    "Choose from 2 to 120 months. For one month, use a one-time donation.": "בחרו בין 2 ל-120 חודשים. לחודש אחד השתמשו בתרומה חד-פעמית.",
    "Your selected amount will repeat every month until you cancel it.": "הסכום שבחרתם יחויב מדי חודש עד שתבטלו.",
    "Please choose between 2 and 120 months.": "נא לבחור בין 2 ל-120 חודשים.",
    "Ends automatically": "מסתיים אוטומטית",
    "Limited monthly donation": "תרומה חודשית לזמן מוגבל",
    "Ongoing monthly donation": "תרומה חודשית מתמשכת",
    "months total": "חודשים בסך הכל",
    "This limited monthly donation was canceled early and cannot be resumed. You can start a new monthly donation anytime.": "התרומה החודשית המוגבלת בוטלה מוקדם ולא ניתן להפעיל אותה מחדש. ניתן להתחיל תרומה חודשית חדשה בכל עת.",
    "One-time": "חד-פעמי",
    "Monthly": "חודשי",
    "Recurring": "הוראת קבע",
    "Make a one-time donation.": "תרומה חד-פעמית.",
    "Your selected amount will repeat every month.": "הסכום שבחרתם יחויב מדי חודש.",
    "Donation amount": "סכום התרומה",
    "Monthly donations are charged automatically every month until canceled.": "תרומות חודשיות מחויבות אוטומטית מדי חודש עד לביטול.",
    "Contact us": "צרו קשר",
    "to cancel or change a recurring donation.": "כדי לבטל או לשנות תרומה חודשית.",
    "Continue to Monthly Donation": "המשך לתרומה חודשית",
    "Secure provider forms": "טפסי תשלום מאובטחים",
    "Irgun does not store full card numbers": "האירגון אינו שומר מספרי כרטיס אשראי מלאים",
    "Mail Donation": "תרומה בדואר",
    "OJC Card": "כרטיס OJC",
    "The Donors’ Fund": "קרן התורמים",
    "Matbia": "מתביה",
    "Your support helps us continue bringing Torah shiurim, live broadcasts and recordings to Jews around the world.": "התרומה שלכם מסייעת לנו להמשיך בהפצת שיעורי תורה, שידורים חיים והקלטות ברחבי העולם.",
    "The secure payment page is hosted by the selected payment provider and displayed here inside the Irgun Shiurai Torah website when that provider allows it.": "עמוד התשלום המאובטח מופעל על ידי ספק התשלום שבחרתם ומוצג בתוך אתר אירגון שיעורי תורה כאשר הספק מאפשר זאת.",
    "Open secure payment form": "פתיחת טופס התשלום המאובטח",
    "Secure-payment note:": "הערה לגבי תשלום מאובטח:",
    "Support Torah learning worldwide through Irgun Shiurai Torah.": "תמיכה בהפצת תורה ברחבי העולם באמצעות אירגון שיעורי תורה.",
    "Forgot Password": "שכחתי סיסמה",
    "Enter the email address on your account and we will send you a secure password reset link.": "הזינו את כתובת האימייל של החשבון ונשלח קישור מאובטח לאיפוס הסיסמה.",
    "Send Reset Link": "שליחת קישור לאיפוס",
    "Reset Password": "איפוס סיסמה",
    "Choose a new password for your Irgun Shiurai Torah account.": "בחרו סיסמה חדשה לחשבון אירגון שיעורי תורה.",
    "Confirm New Password": "אימות הסיסמה החדשה",
    "Privacy Policy": "מדיניות פרטיות",
    "Delete Your Account": "מחיקת החשבון",
    "Delete My Account": "מחיקת החשבון שלי",
    "Contact Irgun Shiurai Torah": "יצירת קשר עם אירגון שיעורי תורה",
    "Open navigation menu": "פתיחת תפריט ניווט",
    "Skip to content": "דילוג לתוכן",
    "Some payment services block their checkout pages from being shown inside another website for security reasons. If the form above is blank or blocked, use the secure provider button below. It opens in a new tab so the Irgun website stays open.": "מטעמי אבטחה, חלק מספקי התשלום אינם מאפשרים להציג את עמוד התשלום בתוך אתר אחר. אם הטופס למעלה אינו מופיע, השתמשו בכפתור המאובטח של הספק. הוא ייפתח בלשונית חדשה והאתר של אירגון שיעורי תורה יישאר פתוח.",
    "If that email is registered, a password reset link has been sent. Please check your inbox and spam folder.": "אם כתובת האימייל רשומה במערכת, נשלח אליה קישור לאיפוס הסיסמה. בדקו גם את תיקיית הספאם.",
    "Could not send reset link.": "לא ניתן לשלוח קישור לאיפוס הסיסמה.",
    "Could not send reset link. Please try again.": "לא ניתן לשלוח את קישור האיפוס. נסו שוב.",
    "The passwords do not match.": "הסיסמאות אינן תואמות.",
    "This reset link is missing or invalid. Please request a new one.": "קישור האיפוס חסר או אינו תקין. בקשו קישור חדש.",
    "Your password has been changed successfully.": "הסיסמה שונתה בהצלחה.",
    "Sign in with your new password": "כניסה באמצעות הסיסמה החדשה",
    "Could not reset password.": "לא ניתן לאפס את הסיסמה.",
    "Could not reset password. Please request a new reset link.": "לא ניתן לאפס את הסיסמה. בקשו קישור איפוס חדש.",
    "Sort": "מיון",
    "Purchase": "רכישה",
    "Shiurim watched & listened to": "שיעורים שנצפו והושמעו",
    "Torah lectures worldwide": "שיעורי תורה ברחבי העולם",
    "No upcoming shiur is posted yet.": "עדיין לא פורסם שיעור קרוב.",
    "Open the schedule for the current flyers.": "פתחו את לוח הזמנים של המודעות הנוכחיות.",
    "View Schedule": "צפייה בלוח הזמנים",
    "Current upcoming schedule will appear here.": "לוח השיעורים הקרובים יופיע כאן.",
    "Trending shiurim will appear here.": "השיעורים הפופולריים יופיעו כאן.",
    "Full Schedule": "לוח זמנים מלא",
    "No upcoming live shiurim are posted yet.": "עדיין לא פורסמו שיעורים קרובים בשידור חי.",
    "Call and press": "התקשרו ולחצו",
    ", then choose Irgun Shiurai Torah and your location.": ", לאחר מכן בחרו אירגון שיעורי תורה ואת המיקום שלכם.",
    "after connecting.": "לאחר החיבור.",
    "After connecting.": "לאחר החיבור.",
    "Loading upcoming shiurim...": "טוען שיעורים קרובים...",
    "upcoming shiurim": "שיעורים קרובים",
    "No upcoming typed shiurim are posted.": "אין כרגע שיעורים קרובים בלוח הכתוב.",
    "Use Original Flyers to see the current notices.": "השתמשו במודעות המקוריות כדי לראות את המודעות הנוכחיות.",
    "RECENT LECTURES — LAST 30 DAYS": "שיעורים אחרונים — 30 הימים האחרונים",
    "Recent Lectures": "שיעורים אחרונים",
    "Showing lectures from the last 30 days.": "מציג שיעורים מ־30 הימים האחרונים.",
    "No recent lectures found for this location.": "לא נמצאו שיעורים אחרונים במקום זה.",
    "Recent schedule items from the last 30 days will appear here.": "שיעורים מלוח הזמנים של 30 הימים האחרונים יופיעו כאן.",
    "CURRENT SCHEDULE": "לוח הזמנים הנוכחי",
    "Clean typed schedule from the same system used by the website, with original flyers always available.": "לוח זמנים כתוב ומסודר מאותה מערכת שבה משתמש האתר, כשהמודעות המקוריות זמינות תמיד.",
    "+ Add Schedule Item": "+ הוספת שיעור ללוח",
    "Loading original flyers...": "טוען מודעות מקוריות...",
    "View larger": "הצגה מוגדלת",
    "FEATURED": "מומלץ",
    "PURCHASED": "נרכש",
    "This purchase is connected, but its tracks are not available right now.": "הרכישה מחוברת לחשבון, אך הרצועות אינן זמינות כרגע.",
    "Edit Product": "עריכת מוצר",
    "SECURE PURCHASE": "רכישה מאובטחת",
    "Payment is processed securely by Stripe. Irgun does not receive your full card number.": "התשלום מעובד בצורה מאובטחת על ידי Stripe. אירגון אינו מקבל את מספר הכרטיס המלא שלכם.",
    "+ Add Paid Shiur": "+ הוספת שיעור בתשלום",
    "Available on this app and your Irgun account.": "זמין באפליקציה זו ובחשבון אירגון שלכם.",
    "Paid shiurim are not available right now.": "שיעורים בתשלום אינם זמינים כרגע.",
    "No paid shiurim have been purchased on this account yet.": "עדיין לא נרכשו שיעורים בחשבון זה.",
    "Clear filters": "ניקוי מסננים",
    "Select one or more.": "בחרו אפשרות אחת או יותר.",
    "Apply": "החל",
    "Topic": "נושא",
    "Recent": "אחרונים",
    "For you": "בשבילכם",
    "Recently active": "פעילים לאחרונה",
    "Popular": "פופולרי",
    "Discover": "גילוי",
    "Latest:": "האחרון:",
    "CONTINUE": "המשך",
    "Continue Listening": "המשך האזנה",
    "DISCOVER": "גילוי",
    "Discover by Speaker": "גילוי לפי מגיד שיעור",
    "FOLLOWING": "במעקב",
    "History": "היסטוריה",
    "New From What You Follow": "חדש ממה שאתם עוקבים אחריו",
    "Search": "חיפוש",
    "Search title, speaker or lecture code…": "חיפוש לפי כותרת, מגיד שיעור או קוד שיעור…",
    "See all": "הצגת הכל",
    "Shuffle": "ערבוב",
    "Sign in to use likes, Watch Later, history, comments and following.": "התחברו כדי להשתמש בלייקים, שמירה לאחר כך, היסטוריה, תגובות ומעקב.",
    "App push is not configured yet.": "התראות דחיפה באפליקציה עדיין אינן מוגדרות.",
    "Delete Account": "מחיקת חשבון",
    "Back to Account": "חזרה לחשבון",
    "Delete Account?": "למחוק את החשבון?",
    "This permanently deletes your Irgun account and its likes, Watch Later list, history, follows, comments and active sessions.": "פעולה זו מוחקת לצמיתות את חשבון אירגון שלכם ואת הלייקים, רשימת השמירה לאחר כך, ההיסטוריה, המעקבים, התגובות וההתחברויות הפעילות.",
    "This cannot be undone.": "לא ניתן לבטל פעולה זו.",
    "Type": "הקלידו",
    "below to continue.": "למטה כדי להמשיך.",
    "Follow a speaker or topic from a shiur to build this feed.": "עקבו אחרי מגיד שיעור או נושא מתוך שיעור כדי לבנות את הפיד הזה.",
    "Remove Offline": "הסרת שמירה לא מקוונת",
    "Downloading": "מוריד",
    "Downloading…": "מוריד…",
    "Listen Offline": "האזנה לא מקוונת",
    "Remove the saved offline copy?": "להסיר את העותק השמור להאזנה לא מקוונת?",
    "This shiur is already downloading.": "השיעור הזה כבר בתהליך הורדה.",
    "Offline listening is available in the installed app.": "האזנה לא מקוונת זמינה באפליקציה המותקנת.",
    "An audio file is not available to save offline.": "אין קובץ אודיו זמין לשמירה לא מקוונת.",
    "Saving…": "שומר…",
    "Saved for offline listening.": "נשמר להאזנה לא מקוונת.",
    "Offline save failed": "השמירה הלא מקוונת נכשלה",
    "Could not save this shiur offline.": "לא ניתן לשמור את השיעור הזה להאזנה לא מקוונת.",
    "Offline copy removed.": "העותק הלא מקוון הוסר.",
    "Sign in to save playlists to your account.": "התחברו כדי לשמור רשימות השמעה בחשבון שלכם.",
    "Playlist could not be created.": "לא ניתן ליצור את רשימת ההשמעה.",
    "Could not create playlist.": "לא ניתן ליצור רשימת השמעה.",
    "Could not add to playlist.": "לא ניתן להוסיף לרשימת ההשמעה.",
    "Could not remove from playlist.": "לא ניתן להסיר מרשימת ההשמעה.",
    "Could not delete playlist.": "לא ניתן למחוק את רשימת ההשמעה.",
    "Sign in to save shiurim and playlists to your account.": "התחברו כדי לשמור שיעורים ורשימות השמעה בחשבון שלכם.",
    "Remove from Save for Later": "הסרה משמירה לאחר כך",
    "Save for Later": "שמירה לאחר כך",
    "Saved to your account": "נשמר בחשבון שלכם",
    "Syncs with your account": "מסתנכרן עם החשבון שלכם",
    "No playlists yet. Create your first one below.": "עדיין אין רשימות השמעה. צרו את הראשונה למטה.",
    "Close": "סגירה",
    "Create & Save": "יצירה ושמירה",
    "PLAYLISTS": "רשימות השמעה",
    "Playlist name": "שם רשימת ההשמעה",
    "Playlists are saved to your account and sync across your devices.": "רשימות ההשמעה נשמרות בחשבון ומסתנכרנות בין המכשירים שלכם.",
    "SAVE": "שמירה",
    "Save Shiur": "שמירת שיעור",
    "Play": "הפעלה",
    "Delete Playlist": "מחיקת רשימת השמעה",
    "Play All": "הפעלת הכל",
    "This playlist is empty. Add shiurim from a card or the player.": "רשימת ההשמעה הזו ריקה. הוסיפו שיעורים מכרטיס שיעור או מהנגן.",
    "synced to your account": "מסונכרן עם החשבון שלכם",
    "← All playlists": "כל רשימות ההשמעה ←",
    "Create Playlist": "יצירת רשימת השמעה",
    "Create your own lists for topics, this week, or any listening order.": "צרו רשימות משלכם לפי נושאים, השבוע או כל סדר האזנה שתרצו.",
    "New playlist name": "שם רשימת השמעה חדשה",
    "No playlists yet.": "עדיין אין רשימות השמעה.",
    "Playlists": "רשימות השמעה",
    "These playlists are saved to your account and sync across devices.": "רשימות אלה נשמרות בחשבון ומסתנכרנות בין המכשירים.",
    "Offline Downloads": "הורדות להאזנה לא מקוונת",
    "These shiurim play from the saved file even without internet.": "השיעורים האלה מתנגנים מהקובץ השמור גם ללא אינטרנט.",
    "Nothing saved yet. Tap “Save Offline” on a shiur card or in the player.": "עדיין לא נשמר דבר. לחצו על „שמירה לא מקוונת” בכרטיס שיעור או בנגן.",
    "Downloads": "הורדות",
    "Hide downloads": "הסתרת הורדות",
    "Pause": "השהיה",
    "Clear": "ניקוי",
    "Cancelled": "בוטל",
    "Failed": "נכשל",
    "Download complete.": "ההורדה הושלמה.",
    "No internet connection and no saved library is available yet.": "אין חיבור לאינטרנט ועדיין אין ספרייה שמורה זמינה.",
    "Using saved library": "משתמש בספרייה השמורה",
    "Retry now": "נסו שוב עכשיו",
    "Request timed out.": "זמן הבקשה הסתיים.",
    "Shiur starting soon": "השיעור מתחיל בקרוב",
    "Upcoming shiur reminders unavailable": "תזכורות לשיעורים קרובים אינן זמינות",
    "Notification permission was not granted.": "לא ניתנה הרשאה להתראות.",
    "Loading the Torah library...": "טוען את ספריית התורה...",
    "Check your internet connection. The app will retry automatically when the connection returns.": "בדקו את חיבור האינטרנט. האפליקציה תנסה שוב אוטומטית כשהחיבור יחזור.",
    "Enter the 6-digit verification code from your email.": "הזינו את קוד האימות בן 6 הספרות מהאימייל.",
    "Login failed.": "ההתחברות נכשלה.",
    "The app Worker is not returning an app session token.": "שרת האפליקציה לא החזיר אסימון התחברות לאפליקציה.",
    "Signed in successfully.": "התחברתם בהצלחה.",
    "Google sign-in is not available in this app build.": "התחברות עם Google אינה זמינה בגרסת האפליקציה הזו.",
    "Google sign-in is not configured yet.": "התחברות עם Google עדיין אינה מוגדרת.",
    "Google did not return a sign-in token.": "Google לא החזיר אסימון התחברות.",
    "The app Worker did not return an app session token.": "שרת האפליקציה לא החזיר אסימון התחברות לאפליקציה.",
    "Signed in with Google.": "התחברתם באמצעות Google.",
    "Google sign-in failed.": "ההתחברות עם Google נכשלה.",
    "Google sign-in was cancelled.": "ההתחברות עם Google בוטלה.",
    "Apple sign-in is not configured yet.": "התחברות עם Apple עדיין אינה מוגדרת.",
    "Apple sign-in security check failed.": "בדיקת האבטחה של התחברות Apple נכשלה.",
    "Apple did not return a sign-in token.": "Apple לא החזירה אסימון התחברות.",
    "Signed in with Apple.": "התחברתם באמצעות Apple.",
    "Apple sign-in failed.": "ההתחברות עם Apple נכשלה.",
    "Apple sign-in was cancelled.": "ההתחברות עם Apple בוטלה.",
    "A 6-digit verification code was sent to your email.": "קוד אימות בן 6 ספרות נשלח לאימייל שלכם.",
    "Registration failed.": "ההרשמה נכשלה.",
    "Registration did not return verification instructions.": "ההרשמה לא החזירה הוראות אימות.",
    "Enter your email and password again.": "הזינו שוב את האימייל והסיסמה.",
    "Enter the 6-digit verification code.": "הזינו את קוד האימות בן 6 הספרות.",
    "Verifying code...": "מאמת את הקוד...",
    "Verification failed.": "האימות נכשל.",
    "Email verified.": "האימייל אומת.",
    "Sending a new verification code...": "שולח קוד אימות חדש...",
    "A new 6-digit verification code was emailed.": "קוד אימות חדש בן 6 ספרות נשלח באימייל.",
    "Could not send verification code.": "לא ניתן לשלוח את קוד האימות.",
    "Could not request a password reset. Please try again.": "לא ניתן לבקש איפוס סיסמה. נסו שוב.",
    "Profile updated.": "הפרופיל עודכן.",
    "Could not update profile.": "לא ניתן לעדכן את הפרופיל.",
    "Sign in to like shiurim.": "התחברו כדי לסמן לייק לשיעורים.",
    "Could not update like.": "לא ניתן לעדכן את הלייק.",
    "Sign in to save shiurim.": "התחברו כדי לשמור שיעורים.",
    "Enter the email address on your account.": "הזינו את כתובת האימייל של החשבון שלכם.",
    "Back to Sign In": "חזרה להתחברות",
    "Verify Email": "אימות אימייל",
    "Enter the 6-digit code sent to your email.": "הזינו את הקוד בן 6 הספרות שנשלח לאימייל.",
    "Code sent to": "הקוד נשלח אל",
    "Verification Code": "קוד אימות",
    "Resend Code": "שליחת קוד מחדש",
    "or": "או",
    "Continue with Apple": "המשך עם Apple",
    "Continue with Google": "המשך עם Google",
    "Try Again": "נסו שוב",
    "Back": "חזרה",
    "Bookmark": "סימניה",
    "Playback speed": "מהירות השמעה",
    "Sleep timer": "טיימר שינה",
    "Close full player": "סגירת הנגן המלא",
    "Loading all original flyers...": "טוען את כל המודעות המקוריות...",
    "Getting flyer list": "טוען את רשימת המודעות",
    "No schedule files are available right now.": "אין כרגע קובצי לוח זמנים זמינים.",
    "Waiting for flyers": "ממתין למודעות",
    "PDF flyer": "מודעת PDF",
    "Tap Open PDF below to view the original flyer.": "לחצו על פתיחת PDF למטה כדי לצפות במודעה המקורית.",
    "Download Video": "הורדת וידאו",
    "MP4 from Irgun storage": "MP4 מאחסון אירגון",
    "MP3 from Irgun storage": "MP3 מאחסון אירגון",
    "No downloadable file is available.": "אין קובץ זמין להורדה.",
    "Edit Shiur": "עריכת שיעור",
    "Live Broadcast": "שידור חי",
    "Torah Shiur": "שיעור תורה",
    "After Maariv": "אחרי מעריב",
    "LIVE": "חי",
    "Shiur": "שיעור",
    "Loading admin controls...": "טוען כלי ניהול...",
    "Loading Dropbox Ads...": "טוען מודעות Dropbox...",
    "Open Dropbox Ads to load the current ad source.": "פתחו את מודעות Dropbox כדי לטעון את מקור המודעות הנוכחי.",
    "No Dropbox folders are available yet.": "עדיין אין תיקיות Dropbox זמינות.",
    "Open image": "פתיחת תמונה",
    "Open PDF": "פתיחת PDF",
    "Expires": "תוקף עד",
    "Save Expiration": "שמירת תאריך תפוגה",
    "No Dropbox ads are available yet.": "עדיין אין מודעות Dropbox זמינות.",
    "Sync Dropbox Now": "סנכרון Dropbox עכשיו",
    "Refresh status": "רענון מצב",
    "Queue next PDFs": "הכנסת קובצי PDF הבאים לתור",
    "No sponsorships yet.": "עדיין אין הקדשות.",
    "Approve": "אישור",
    "Reject": "דחייה",
    "Nothing is waiting for Schedule Review.": "אין כרגע פריטים הממתינים לבדיקת לוח הזמנים.",
    "Review & Edit": "בדיקה ועריכה",
    "Recheck": "בדיקה מחדש",
    "Mark No Schedule": "סימון שאין לוח זמנים",
    "No Stripe donations recorded yet.": "עדיין לא נרשמו תרומות Stripe.",
    "Note / Description": "הערה / תיאור",
    "PROTECTED": "מוגן",
    "Admin Mode": "מצב מנהל",
    "Only accounts authorized by the Worker can see this section. Turn Admin Mode on to show edit controls on Schedule, Shiurim and Paid Shiurim.": "רק חשבונות שהורשו על ידי השרת יכולים לראות אזור זה. הפעילו מצב מנהל כדי להציג כלי עריכה בלוח הזמנים, שיעורים ושיעורים בתשלום.",
    "Schedule & Ads": "לוח זמנים ומודעות",
    "Review schedule extraction or manage the Dropbox ad source.": "בדקו את חילוץ לוח הזמנים או נהלו את מקור מודעות Dropbox.",
    "Schedule Review": "בדיקת לוח זמנים",
    "Dropbox Ads": "מודעות Dropbox",
    "Refresh": "רענון",
    "Stripe Donations": "תרומות Stripe",
    "Recent donations and donor notes/descriptions.": "תרומות אחרונות והערות/תיאורים של תורמים.",
    "Live Stream Override": "עקיפת שידור חי",
    "Show a live player even when no schedule row is live.": "הציגו נגן חי גם כאשר אין שורה פעילה בלוח הזמנים.",
    "Save Live Settings": "שמירת הגדרות שידור חי",
    "Sponsor Ribbon": "פס הקדשה",
    "Show Ribbon": "הצגת הפס",
    "On": "פעיל",
    "Off": "כבוי",
    "Link (optional)": "קישור (אופציונלי)",
    "Ribbon Text (English)": "טקסט הפס (אנגלית)",
    "Ribbon Text (Hebrew)": "טקסט הפס (עברית)",
    "Save Ribbon": "שמירת הפס",
    "Sponsorship Prices": "מחירי הקדשה",
    "One Day ($)": "יום אחד ($)",
    "One Week ($)": "שבוע אחד ($)",
    "One Month ($)": "חודש אחד ($)",
    "Save Prices": "שמירת מחירים",
    "Plan": "מסלול",
    "Start Date": "תאריך התחלה",
    "Dedication": "הקדשה",
    "Choose dedication": "בחירת הקדשה",
    "Name in English": "שם באנגלית",
    "Name in Hebrew": "שם בעברית",
    "Shiur Play Counter": "מונה השמעות שיעור",
    "Administrators": "מנהלים",
    "Add Admin": "הוספת מנהל",
    "No administrators configured.": "לא הוגדרו מנהלים.",
    "Content Editing": "עריכת תוכן",
    "With Admin Mode on, Schedule cards show Add/Edit/Delete, video shiur cards show Edit Shiur, and Paid Shiurim show Add/Edit/Delete. Every save is checked by the protected Worker endpoint.": "כאשר מצב מנהל פעיל, כרטיסי לוח הזמנים מציגים הוספה/עריכה/מחיקה, כרטיסי וידאו מציגים עריכת שיעור, ושיעורים בתשלום מציגים הוספה/עריכה/מחיקה. כל שמירה נבדקת על ידי נקודת הקצה המוגנת בשרת.",
    "Open Schedule": "פתיחת לוח הזמנים",
    "Open Shiurim": "פתיחת שיעורים",
    "Open Paid Shiurim": "פתיחת שיעורים בתשלום",
    "Full Website Admin": "ניהול מלא באתר",
    "ADMIN": "מנהל",
    "Product ID": "מזהה מוצר",
    "Price ($)": "מחיר ($)",
    "English Title": "כותרת באנגלית",
    "Hebrew Title": "כותרת בעברית",
    "Speaker": "מגיד שיעור",
    "Category": "קטגוריה",
    "Audience": "קהל יעד",
    "Catalog Details": "פרטי קטלוג",
    "Formatting: **bold**, _italic_, blank lines for spacing, and - item for bullets.": "עיצוב: **מודגש**, _נטוי_, שורות ריקות לרווח, ו־- לפריטי רשימה.",
    "Drive Matching Aliases": "שמות חלופיים להתאמה ב-Drive",
    "Featured product": "מוצר מומלץ",
    "Date": "תאריך",
    "Start": "התחלה",
    "End": "סיום",
    "Location": "מיקום",
    "Venue": "מקום השיעור",
    "Date Label": "תווית תאריך",
    "Hebrew Date": "תאריך עברי",
    "Program": "תוכנית",
    "Language": "שפה",
    "Year": "שנה",
    "Shiur Code": "קוד שיעור",
    "SCHEDULE REVIEW": "בדיקת לוח זמנים",
    "Edit Detected Lectures": "עריכת שיעורים שזוהו",
    "No candidate lectures were detected. Add one manually or use Mark No Schedule.": "לא זוהו שיעורים אפשריים. הוסיפו שיעור ידנית או השתמשו בסימון שאין לוח זמנים.",
    "+ Add Lecture": "+ הוספת שיעור",
    "Review Note": "הערת בדיקה",
    "Approve Schedule": "אישור לוח הזמנים",
    "Admin": "מנהל",

    "Could not update Watch Later.": "לא ניתן לעדכן את השמירה לאחר כך.",
    "Could not update follow.": "לא ניתן לעדכן את המעקב.",
    "Could not remove history item.": "לא ניתן להסיר את הפריט מההיסטוריה.",
    "Clear your entire watch history?": "למחוק את כל היסטוריית הצפייה וההאזנה?",
    "Could not clear history.": "לא ניתן למחוק את ההיסטוריה.",
    "Torah audio collection from Irgun Shiurai Torah.": "אוסף שיעורי אודיו תורניים מאירגון שיעורי תורה.",
    "LIVE NOW": "בשידור חי עכשיו",
    "RECURRING LIVE EVENT": "שידור חי קבוע",
    "Paid shiur": "שיעור בתשלום",
    "Audio Collection": "אוסף אודיו",
    "Loading available collections and your purchases…": "טוען אוספים זמינים ואת הרכישות שלכם…",
    "Loading audio collections…": "טוען אוספי אודיו…",
    "One-time purchase": "רכישה חד־פעמית",
    "Private access": "גישה פרטית",
    "Listen in the app": "האזנה באפליקציה",
    "The purchase page could not load": "עמוד הרכישה לא הצליח להיטען",
    "Enter a valid email address.": "הזינו כתובת אימייל תקינה.",
    "Choose between 2 and 120 months.": "בחרו בין 2 ל־120 חודשים.",
    "Choose a sponsorship date and dedication type.": "בחרו תאריך וסוג הקדשה.",
    "Enter the dedication name in English or Hebrew.": "הזינו את שם ההקדשה באנגלית או בעברית.",
    "Could not start secure payment.": "לא ניתן להתחיל תשלום מאובטח.",
    "Processing secure payment...": "מעבד תשלום מאובטח...",
    "Payment could not be completed.": "לא ניתן להשלים את התשלום.",
    "Thank you. Your donation was received.": "תודה. התרומה שלכם התקבלה.",
    "PDF is not available.": "קובץ ה־PDF אינו זמין.",
    "Preparing PDF download...": "מכין את קובץ ה־PDF להורדה...",
    "Opening PDF...": "פותח את קובץ ה־PDF...",
    "PDF download started.": "הורדת קובץ ה־PDF התחילה.",
    "PDF opened.": "קובץ ה־PDF נפתח.",
    "PDF download ready.": "קובץ ה־PDF מוכן.",
    "PDF could not be opened.": "לא ניתן לפתוח את קובץ ה־PDF.",
    "Album picture": "תמונת האלבום",
    "your account": "החשבון שלכם",
    "Private audio collections connected to your account.": "אוספי אודיו פרטיים המחוברים לחשבון שלכם.",
    "You have no paid shiurim in this account yet.": "עדיין אין שיעורים בתשלום בחשבון זה.",
    "Nothing here yet.": "עדיין אין כאן פריטים.",
    "Deleting…": "מוחק…",
    "Please type DELETE to confirm account deletion.": "נא להקליד DELETE כדי לאשר את מחיקת החשבון.",
    "Your account and associated app data were deleted.": "החשבון שלכם והנתונים המשויכים אליו באפליקציה נמחקו.",
    "Could not delete your account. Please try again.": "לא ניתן למחוק את החשבון. נסו שוב.",
    "Upcoming Shiur Reminder": "תזכורת לפני שיעור קרוב",
    "A local notification before a scheduled shiur begins.": "התראה מקומית לפני תחילת שיעור מתוכנן.",
    "Reminder Time": "זמן התזכורת",
    "How long before the shiur starts.": "כמה זמן לפני תחילת השיעור.",
    "10 min": "10 דקות",
    "30 min": "30 דקות",
    "1 hour": "שעה אחת",
    "Reminder Cities": "ערים לתזכורות",
    "Choose which cities should trigger upcoming-shiur reminders.": "בחרו מאילו ערים לקבל תזכורות לשיעורים קרובים.",
    "Updating…": "מעדכן…",
    "· Permanently ignored": "· מוחרג לצמיתות",
    "Dropbox ad": "מודעת Dropbox",
    "Show Again": "הצג שוב",
    "Dropbox is active on the website": "Dropbox פעיל באתר",
    "Preview mode · current website source unchanged": "מצב תצוגה מקדימה · מקור האתר הנוכחי לא השתנה",
    "Use legacy source": "השתמש במקור הישן",
    "Activate Dropbox on website": "הפעל Dropbox באתר",
    "Dropbox Ads updated.": "מודעות Dropbox עודכנו.",
    "Dropbox Ads update failed.": "עדכון מודעות Dropbox נכשל.",
    "Could not update Dropbox folder.": "לא ניתן לעדכן את תיקיית Dropbox.",
    "Could not update ad.": "לא ניתן לעדכן את המודעה.",
    "Could not open Dropbox ad file.": "לא ניתן לפתוח את קובץ מודעת Dropbox.",
    "Ad expiration saved.": "תאריך התפוגה של המודעה נשמר.",
    "Could not save expiration.": "לא ניתן לשמור את תאריך התפוגה.",
    "Schedule flyer": "מודעת לוח שיעורים",
    "Edit Sponsorship": "עריכת הקדשה",
    "Add Sponsorship Manually": "הוספת הקדשה ידנית",
    "Add Approved Sponsorship": "הוספת הקדשה מאושרת",
    "Live stream settings saved.": "הגדרות השידור החי נשמרו.",
    "Could not save live settings.": "לא ניתן לשמור את הגדרות השידור החי.",
    "Sponsor ribbon saved.": "סרט ההקדשה נשמר.",
    "Could not save ribbon.": "לא ניתן לשמור את סרט ההקדשה.",
    "Sponsorship prices saved.": "מחירי ההקדשות נשמרו.",
    "Could not save prices.": "לא ניתן לשמור את המחירים.",
    "Sponsorship updated.": "ההקדשה עודכנה.",
    "Approved sponsorship added.": "נוספה הקדשה מאושרת.",
    "Could not save sponsorship.": "לא ניתן לשמור את ההקדשה.",
    "Delete this sponsorship permanently?": "למחוק את ההקדשה הזו לצמיתות?",
    "Reject this sponsorship?": "לדחות את ההקדשה הזו?",
    "Could not update sponsorship.": "לא ניתן לעדכן את ההקדשה.",
    "Counter saved.": "המונה נשמר.",
    "Could not save counter.": "לא ניתן לשמור את המונה.",
    "Administrator added.": "נוסף מנהל.",
    "Could not add administrator.": "לא ניתן להוסיף מנהל.",
    "Remove this administrator?": "להסיר את המנהל הזה?",
    "Administrator removed.": "המנהל הוסר.",
    "Could not remove administrator.": "לא ניתן להסיר את המנהל.",
    "Mark this flyer as having no schedule?": "לסמן שלמודעה הזו אין לוח שיעורים?",
    "Flyer queued for recheck.": "המודעה הוכנסה לתור לבדיקה מחדש.",
    "Marked as no schedule.": "סומן שאין לוח שיעורים.",
    "Schedule review update failed.": "עדכון בדיקת לוח השיעורים נכשל.",
    "Schedule approved.": "לוח השיעורים אושר.",
    "Could not approve schedule.": "לא ניתן לאשר את לוח השיעורים.",
    "Could not load paid catalog.": "לא ניתן לטעון את קטלוג השיעורים בתשלום.",
    "Paid shiur saved.": "השיעור בתשלום נשמר.",
    "Could not save paid shiur.": "לא ניתן לשמור את השיעור בתשלום.",
    "Delete this paid catalog item?": "למחוק את הפריט הזה מקטלוג השיעורים בתשלום?",
    "Paid catalog item deleted.": "פריט הקטלוג בתשלום נמחק.",
    "Could not delete paid item.": "לא ניתן למחוק את הפריט בתשלום.",
    "Schedule item saved.": "פריט לוח הזמנים נשמר.",
    "Could not save schedule item.": "לא ניתן לשמור את פריט לוח הזמנים.",
    "Delete this schedule item?": "למחוק את הפריט הזה מלוח הזמנים?",
    "Schedule item deleted.": "פריט לוח הזמנים נמחק.",
    "Could not delete schedule item.": "לא ניתן למחוק את פריט לוח הזמנים.",
    "Shiur updated and live.": "השיעור עודכן ופורסם.",
    "Could not save shiur.": "לא ניתן לשמור את השיעור.",
    "Edit Schedule Item": "עריכת פריט בלוח הזמנים",
    "Add Schedule Item": "הוספת פריט ללוח הזמנים",
    "Start Time": "שעת התחלה",
    "End Time": "שעת סיום",
    "Speaker (English)": "מגיד שיעור (אנגלית)",
    "Speaker (Hebrew)": "מגיד שיעור (עברית)",
    "Title (English)": "כותרת (אנגלית)",
    "Title (Hebrew)": "כותרת (עברית)",
    "Topic (English)": "נושא (אנגלית)",
    "Topic (Hebrew)": "נושא (עברית)",
    "Edit Paid Shiur": "עריכת שיעור בתשלום",
    "Add Paid Shiur": "הוספת שיעור בתשלום",
    "Lecture Date": "תאריך השיעור",
    "Edit the date this shiur was given. This is separate from the upload date.": "ערכו את התאריך שבו נמסר השיעור. תאריך זה נפרד מתאריך ההעלאה.",
    "Alternate / Rabbi Name": "שם חלופי / שם הרב",
    "Program / Series": "תוכנית / סדרה",
    "Showcase ID": "מזהה Showcase",
    "Please wait...": "נא להמתין...",
    "Create your Irgun Shiurai Torah account.": "צרו את חשבון אירגון שיעורי תורה שלכם.",
    "Sign in to access your account.": "התחברו כדי לגשת לחשבון שלכם.",
    "Already have an account? Sign in": "כבר יש לכם חשבון? התחברו",
    "Don't have an account? Create account": "אין לכם חשבון? צרו חשבון",
    "Playing offline copy": "מתנגן מהעותק השמור",
    "Skip buttons": "כפתורי דילוג",
    "15 min": "15 דקות",
    "45 min": "45 דקות",
    "60 min": "60 דקות",
    "Push notifications enabled on this app.": "התראות דחיפה הופעלו באפליקציה זו.",
    "Push notifications disabled on this app.": "התראות דחיפה הושבתו באפליקציה זו.",
    "Email notifications enabled.": "התראות באימייל הופעלו.",
    "Email notifications disabled.": "התראות באימייל הושבתו.",
    "Monthly donation cancellation updated.": "ביטול התרומה החודשית עודכן.",
    "Monthly donation will stay active.": "התרומה החודשית תישאר פעילה.",
    "Preparing secure playback...": "מכין השמעה מאובטחת...",
    "Could not start protected playback.": "לא ניתן להתחיל את ההשמעה המוגנת.",
    "Payment received. Your purchased shiur is ready.": "התשלום התקבל. השיעור שרכשתם מוכן.",
    "Payment is still processing.": "התשלום עדיין בעיבוד.",
    "Payment return received. Account status will refresh shortly.": "התקבל עדכון מהתשלום. מצב החשבון יתעדכן בקרוב.",
    "Playlist created and shiur added.": "הרשימה נוצרה והשיעור נוסף.",
    "Admin Mode enabled.": "מצב מנהל הופעל.",
    "Admin Mode hidden.": "מצב מנהל הוסתר.",
    "Donations refreshed.": "התרומות עודכנו.",
    "Listen Later": "האזנה לאחר מכן",
    "Open Ad": "פתיחת מודעה",
    "Link copied.": "הקישור הועתק.",
    "This shiur is not available for download.": "שיעור זה אינו זמין להורדה.",
    "Audio is not available.": "האודיו אינו זמין.",
    "Picture in Picture is not available on this device.": "תמונה בתוך תמונה אינה זמינה במכשיר זה.",
    "Start the video, then try Picture in Picture again.": "הפעילו את הווידאו ואז נסו שוב תמונה בתוך תמונה.",
    "Could not start Picture in Picture.": "לא ניתן להפעיל תמונה בתוך תמונה.",
    "Video is still playing. The fallback audio player will be used if needed.": "הווידאו עדיין מתנגן. נגן האודיו החלופי ישמש בעת הצורך.",
    "Switched to the fallback player without losing your place.": "עבר לנגן החלופי בלי לאבד את המיקום שלכם.",
    "Switched to the fallback player.": "עבר לנגן החלופי.",
    "Audio is not ready yet. Video is still playing.": "האודיו עדיין לא מוכן. הווידאו ממשיך להתנגן.",
    "Video is not ready yet. Audio is still playing.": "הווידאו עדיין לא מוכן. האודיו ממשיך להתנגן.",
    "Please sign in to leave a comment.": "התחברו כדי להשאיר תגובה.",
    "Could not post comment.": "לא ניתן לפרסם את התגובה.",
    "Could not edit comment.": "לא ניתן לערוך את התגובה.",
    "Could not delete comment.": "לא ניתן למחוק את התגובה.",
    "Open Full Page ↗": "פתיחת העמוד המלא ↗",
    "Quick access": "גישה מהירה",
    "Secure donation provider": "ספק תרומה מאובטח",
    "Tax ID / EIN:": "מספר זיהוי לצורכי מס / EIN:",

    "Previous picture": "התמונה הקודמת",
    "Next picture": "התמונה הבאה",
    "Close video": "סגירת הווידאו",
    "Keep playing at bottom of app": "המשך הפעלה בתחתית האפליקציה",
    "Mini player": "נגן מוקטן",
    "Picture in Picture": "תמונה בתוך תמונה",
    "Search mode": "מצב חיפוש",
    "Open video": "פתיחת וידאו",
    "Account email": "אימייל החשבון",
    "Auto-generated if blank": "נוצר אוטומטית אם נשאר ריק",
    "One per line": "אחד בכל שורה",
    "Total": "סה״כ",
    "Type DELETE": "הקלידו DELETE",

  };

  const originalText = new Map();
  const originalAttributes = new Map();
  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  let currentLanguage = (queryLanguage === "he" || queryLanguage === "en") ? queryLanguage : (localStorage.getItem("istLanguage") === "he" ? "he" : "en");
  let observer = null;

  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "he" ? "rtl" : "ltr";
  document.documentElement.classList.toggle("ist-hebrew", currentLanguage === "he");

  function interpolate(template, values) {
    return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) =>
      values && values[key] != null ? String(values[key]) : ""
    );
  }

  const SHOWCASE_HEBREW_BY_ID = {
    "12369119": "שיעורי הרב זאב סמיט – תשפ\"ז",
    "12307671": "שיעורי קיץ פלטבוש – תשפ\"ו",
    "11898343": "שיעורי הרב זאב סמיט – תשפ\"ו",
    "11898340": "שיעורים יומיים וחול המועד – תשפ\"ו",
    "11777050": "שיעורי קיץ פלטבוש – תשפ\"ה",
    "11403516": "שיעורי הרב זאב סמיט – תשפ\"ה",
    "11403467": "שיעורים יומיים וחול המועד – תשפ\"ה",
    "11420419": "שיעורי פרשה – הרב אלעזר ניסן רובין",
    "11418895": "שיעורי לייקווד – חול המועד",
    "12330572": "שיעורי קיץ פלטבוש – תשפ\"ד ומוקדם יותר",
    "12330788": "שיעורי הרב זאב סמיט – תשפ\"ד ומוקדם יותר",
    "12330674": "שיעורים יומיים ביידיש – תשפ\"ד ומוקדם יותר"
  };

  const HEBREW_YEAR_BY_NUMBER = {
    "5784": "תשפ\"ד",
    "5785": "תשפ\"ה",
    "5786": "תשפ\"ו",
    "5787": "תשפ\"ז"
  };

  function normalizeShowcaseLabel(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[‐‑‒–—―−]/g, "-")
      .replace(/[’‘]/g, "'")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function translateShowcaseName(id, value) {
    const raw = normalizeShowcaseLabel(value || "Video Series");
    if (currentLanguage !== "he") return raw;
    if (!raw) return "סדרת שיעורים";
    if (/[\u0590-\u05FF]/.test(raw) && !/[A-Za-z]{3,}/.test(raw)) return raw;

    // Try the ordinary translation dictionary first after normalization.
    if (he[raw]) return he[raw];

    const simple = raw
      .replace(/\bI\s*\.\s*S\s*\.\s*T\s*\.?\s*/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    const lower = simple.toLowerCase();
    const yearMatch = simple.match(/\b(578[4-7])\b/);
    const year = yearMatch ? HEBREW_YEAR_BY_NUMBER[yearMatch[1]] : "";
    const older = /\b(?:from\s+)?5784\s+(?:and|&)\s+older\b|\b5784\s*(?:&|and)\s*older\b/i.test(simple);

    if (/daily\s+yiddish\s+shiurim/i.test(simple)) {
      return older
        ? "שיעורים יומיים ביידיש – תשפ\"ד ומוקדם יותר"
        : year ? `שיעורים יומיים ביידיש – ${year}` : "שיעורים יומיים ביידיש";
    }

    if (/rav\s+zev\s+smith.*shiurim|shiurim.*rav\s+zev\s+smith/i.test(simple)) {
      return older
        ? "שיעורי הרב זאב סמיט – תשפ\"ד ומוקדם יותר"
        : year ? `שיעורי הרב זאב סמיט – ${year}` : "שיעורי הרב זאב סמיט";
    }

    if (/(?:rav|rabbi)\s+el(?:u|o)zer\s+niss?en\s+rubin/i.test(simple)) {
      return year ? `הרב אלעזר ניסן רובין – ${year}` : "הרב אלעזר ניסן רובין";
    }

    if (/summer\s+flatbush\s+shiurim/i.test(simple)) {
      return older
        ? "שיעורי קיץ פלטבוש – תשפ\"ד ומוקדם יותר"
        : year ? `שיעורי קיץ פלטבוש – ${year}` : "שיעורי קיץ פלטבוש";
    }

    if (/lakewood\s+shiurim/i.test(simple)) return "שיעורי לייקווד";
    if (/lakewood.*chol\s+hamoed|chol\s+hamoed.*lakewood/i.test(simple)) return "שיעורי לייקווד – חול המועד";
    if (/parsha.*(?:rav|rabbi)\s+el(?:u|o)zer\s+niss?en\s+rubin/i.test(simple)) return "שיעורי פרשה – הרב אלעזר ניסן רובין";
    if (/daily\s*(?:&|and)\s*chol\s+hamoed/i.test(simple)) return year ? `שיעורים יומיים וחול המועד – ${year}` : "שיעורים יומיים וחול המועד";
    if (/summer\s+flatbush/i.test(simple)) return year ? `שיעורי קיץ פלטבוש – ${year}` : "שיעורי קיץ פלטבוש";

    // Stable Vimeo IDs are a final fallback. Name-based translation above wins,
    // so an upstream rename/year change can never receive the wrong year solely
    // because the ID stayed the same.
    const byId = SHOWCASE_HEBREW_BY_ID[String(id || "").trim()];
    if (byId) return byId;

    // Never leave known English showcase boilerplate untranslated in Hebrew mode.
    if (lower === "video series") return "סדרת שיעורים";
    return translateValue(raw);
  }

  function translateValue(value) {
    const key = String(value);
    if (currentLanguage !== "he") return key;
    if (he[key]) return he[key];

    let match = key.match(/^(\d+) videos • (\d+) audio recordings$/);
    if (match) return interpolate(he["{{videos}} videos • {{audio}} audio recordings"], { videos: match[1], audio: match[2] });

    // Current Vimeo showcase names have changed formatting over time. Translate
    // the common live-name variants even when Vimeo changes dash placement.
    match = key.match(/^(?:I\.S\.T\.\s*)?Daily Yiddish Shiurim\s*(?:-|–)?\s*(578[4-7])$/i);
    if (match) {
      const years = {"5784":"תשפ\"ד","5785":"תשפ\"ה","5786":"תשפ\"ו","5787":"תשפ\"ז"};
      return `שיעורים יומיים ביידיש – ${years[match[1]] || match[1]}`;
    }

    match = key.match(/^Rav Zev Smith Shiurim\s*(?:-|–)?\s*(578[4-7])$/i);
    if (match) {
      const years = {"5784":"תשפ\"ד","5785":"תשפ\"ה","5786":"תשפ\"ו","5787":"תשפ\"ז"};
      return `שיעורי הרב זאב סמיט – ${years[match[1]] || match[1]}`;
    }

    match = key.match(/^Daily Yiddish Shiurim from 5784 and older$/i);
    if (match) return `שיעורים יומיים ביידיש – תשפ\"ד ומוקדם יותר`;

    match = key.match(/^Rav Zev Smith Shiurim from 5784 and older$/i);
    if (match) return `שיעורי הרב זאב סמיט – תשפ\"ד ומוקדם יותר`;

    match = key.match(/^Summer Flatbush Shiurim from 5784 and older$/i);
    if (match) return `שיעורי קיץ פלטבוש – תשפ\"ד ומוקדם יותר`;

    match = key.match(/^(\d+) shiurim available$/);
    if (match) return interpolate(he["{{count}} shiurim available"], { count: match[1] });

    match = key.match(/^Found (\d+) shiurim$/);
    if (match) return interpolate(he["Found {{count}} shiurim"], { count: match[1] });

    match = key.match(/^Found (\d+) recordings$/);
    if (match) return interpolate(he["Found {{count}} recordings"], { count: match[1] });

    match = key.match(/^Resumed at (.+)$/);
    if (match) return `הצפייה חודשה מ־${match[1]}`;

    match = key.match(/^Resumed listening at (.+)$/);
    if (match) return `ההאזנה חודשה מ־${match[1]}`;

    match = key.match(/^Donate (\$[0-9,.]+)$/);
    if (match) return `תרמו ${match[1]}`;

    match = key.match(/^Pay (\$[0-9,.]+) securely$/);
    if (match) return `שלמו ${match[1]} באופן מאובטח`;

    match = key.match(/^Start (\$[0-9,.]+) monthly • (\d+)(?:st|nd|rd|th) • (\d+) months$/);
    if (match) return `התחילו תרומה של ${match[1]} לחודש • יום ${match[2]} • ${match[3]} חודשים`;

    match = key.match(/^Start (\$[0-9,.]+) monthly • (\d+)(?:st|nd|rd|th)$/);
    if (match) return `התחילו תרומה של ${match[1]} לחודש • יום ${match[2]}`;

    match = key.match(/^Start (\$[0-9,.]+) monthly$/);
    if (match) return `התחילו תרומה של ${match[1]} לחודש`;

    match = key.match(/^Your selected amount will be charged on the (.+) of each month for (\d+) months\.$/);
    if (match) {
      const day = String(match[1]).replace(/^(\d+)(?:st|nd|rd|th)$/i, "יום $1").replace(/^selected day$/i, "יום שנבחר");
      return `הסכום שבחרתם יחויב ב${day} בכל חודש במשך ${match[2]} חודשים.`;
    }

    match = key.match(/^Your selected amount will be charged on the (.+) of each month until you cancel it\.$/);
    if (match) {
      const day = String(match[1]).replace(/^(\d+)(?:st|nd|rd|th)$/i, "יום $1").replace(/^selected day$/i, "יום שנבחר");
      return `הסכום שבחרתם יחויב ב${day} בכל חודש עד שתבטלו.`;
    }

    match = key.match(/^Stripe will charge this donation on the (.+) of each month for (\d+) months, then it will stop automatically\.$/);
    if (match) {
      const day = String(match[1]).replace(/^(\d+)(?:st|nd|rd|th)$/i, "יום $1").replace(/^selected day$/i, "יום שנבחר");
      return `Stripe יחייב את התרומה ב${day} בכל חודש במשך ${match[2]} חודשים, ולאחר מכן היא תיפסק אוטומטית.`;
    }

    match = key.match(/^Stripe will charge this donation on the (.+) of each month until canceled\.$/);
    if (match) {
      const day = String(match[1]).replace(/^(\d+)(?:st|nd|rd|th)$/i, "יום $1").replace(/^selected day$/i, "יום שנבחר");
      return `Stripe יחייב את התרומה ב${day} בכל חודש עד לביטול.`;
    }

    match = key.match(/^(\d+) videos - (\d+) audio recordings$/);
    if (match) return `${match[1]} שיעורי וידאו - ${match[2]} הקלטות אודיו`;

    match = key.match(/^(\d+) streams? available$/);
    if (match) return `${match[1]} שידורים זמינים`;

    match = key.match(/^(\d+) downloads?$/);
    if (match) return Number(match[1]) === 1 ? "הורדה אחת" : `${match[1]} הורדות`;

    match = key.match(/^(\d+) tracks?$/);
    if (match) return Number(match[1]) === 1 ? "רצועה אחת" : `${match[1]} רצועות`;

    match = key.match(/^(\d+) sec$/);
    if (match) return `${match[1]} שניות`;

    match = key.match(/^(\d+) selected$/);
    if (match) return `${match[1]} נבחרו`;

    match = key.match(/^All (locations|years|languages|speakers|topics)$/);
    if (match) {
      const labels = { locations: "כל המקומות", years: "כל השנים", languages: "כל השפות", speakers: "כל מגידי השיעורים", topics: "כל הנושאים" };
      return labels[match[1]] || key;
    }

    match = key.match(/^Match at (.+)$/);
    if (match) return `התאמה ב־${match[1]}`;

    match = key.match(/^Go to (.+)$/);
    if (match) return `מעבר ל־${match[1]}`;

    match = key.match(/^Bookmark saved at (.+)\.$/);
    if (match) return `הסימניה נשמרה ב־${match[1]}.`;

    match = key.match(/^Already in (.+)$/);
    if (match) return `כבר נמצא ב־${match[1]}`;

    match = key.match(/^Added to (.+)$/);
    if (match) return `נוסף ל־${match[1]}`;

    match = key.match(/^Saved (.+)\.$/);
    if (match) return `נשמר ${match[1]}.`;

    match = key.match(/^Sponsorship (approved|deleted|rejected)\.$/);
    if (match) {
      const labels = { approved: "ההקדשה אושרה.", deleted: "ההקדשה נמחקה.", rejected: "ההקדשה נדחתה." };
      return labels[match[1]] || key;
    }

    match = key.match(/^Show picture (\d+)$/);
    if (match) return `הצג תמונה ${match[1]}`;

    match = key.match(/^Back (\d+) seconds$/);
    if (match) return `חזרה ${match[1]} שניות`;

    match = key.match(/^Forward (\d+) seconds$/);
    if (match) return `קדימה ${match[1]} שניות`;

    return key;
  }

  function t(key, values = {}) {
    const source = translateValue(key);
    return interpolate(source, values);
  }

  function translateTextNode(node) {
    if (!node.nodeValue || node.parentElement?.closest("[data-i18n-ignore]")) return;

    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const translated = translateValue(trimmed);
    if (translated === trimmed) return;

    originalText.set(node, raw);
    node.nodeValue = raw.replace(trimmed, translated);
  }

  function translateAttributes(element) {
    if (!(element instanceof Element) || element.closest("[data-i18n-ignore]")) return;

    const values = originalAttributes.get(element) || {};
    let changed = false;

    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const value = element.getAttribute(attribute);
      const translated = value ? translateValue(value) : value;
      if (value && translated !== value) {
        values[attribute] = value;
        element.setAttribute(attribute, translated);
        changed = true;
      }
    }

    if (changed) originalAttributes.set(element, values);
  }

  function translateTree(root) {
    if (currentLanguage !== "he") return;

    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }

    if (!(root instanceof Element) && root !== document) return;
    if (root instanceof Element) translateAttributes(root);

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const tag = node.parentElement?.tagName;
          return ["SCRIPT", "STYLE", "NOSCRIPT"].includes(tag)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while (walker.nextNode()) translateTextNode(walker.currentNode);

    if (root.querySelectorAll) {
      root.querySelectorAll("[placeholder], [title], [aria-label]")
        .forEach(translateAttributes);
    }
  }

  function restoreEnglish() {
    for (const [node, value] of originalText) {
      if (node.isConnected) node.nodeValue = value;
    }
    originalText.clear();

    for (const [element, values] of originalAttributes) {
      if (!element.isConnected) continue;
      for (const [attribute, value] of Object.entries(values)) {
        element.setAttribute(attribute, value);
      }
    }
    originalAttributes.clear();
  }

  function updateToggle() {
    const button = document.getElementById("istLanguageToggle");
    if (!button) return;

    button.textContent = currentLanguage === "he" ? "English" : "עברית";
    button.setAttribute(
      "aria-label",
      currentLanguage === "he" ? "Switch to English" : "החלף לעברית"
    );
  }

  function applyLanguage(language) {
    currentLanguage = language === "he" ? "he" : "en";
    localStorage.setItem("istLanguage", currentLanguage);

    document.documentElement.lang = currentLanguage;
    document.documentElement.dir = currentLanguage === "he" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("ist-hebrew", currentLanguage === "he");
    document.body?.classList.toggle("is-hebrew", currentLanguage === "he");

    if (currentLanguage === "he") {
      injectHebrewFonts();
      translateTree(document);
    }
    else restoreEnglish();

    updateToggle();
    window.dispatchEvent(
      new CustomEvent("ist-language-change", {
        detail: { language: currentLanguage }
      })
    );
  }

  function injectToggle() {
    if (document.getElementById("istLanguageToggle")) return;

    const button = document.createElement("button");
    button.id = "istLanguageToggle";
    button.type = "button";
    button.className = "ist-language-toggle";
    button.setAttribute("data-i18n-ignore", "true");
    button.addEventListener("click", () =>
      applyLanguage(currentLanguage === "he" ? "en" : "he")
    );

    const nav = document.querySelector(".nav-links");
    const login = document.getElementById("loginLink");

    if (nav) nav.insertBefore(button, login || null);
    else document.body.appendChild(button);
  }

  function injectHebrewFonts() {
    if (document.getElementById("istHebrewFonts")) return;

    const preconnectGoogle = document.createElement("link");
    preconnectGoogle.rel = "preconnect";
    preconnectGoogle.href = "https://fonts.googleapis.com";

    const preconnectStatic = document.createElement("link");
    preconnectStatic.rel = "preconnect";
    preconnectStatic.href = "https://fonts.gstatic.com";
    preconnectStatic.crossOrigin = "anonymous";

    const fontLink = document.createElement("link");
    fontLink.id = "istHebrewFonts";
    fontLink.rel = "stylesheet";
    fontLink.href = "https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;600;700&family=Heebo:wght@400;500;600;700;800&display=swap";

    document.head.append(preconnectGoogle, preconnectStatic, fontLink);
  }

  function injectStyles() {
    if (document.getElementById("istI18nStyles")) return;

    const style = document.createElement("style");
    style.id = "istI18nStyles";
    style.textContent = `
      :root {
        --ist-hebrew-ui: "Heebo", "Noto Sans Hebrew", Arial, sans-serif;
        --ist-hebrew-display: "Frank Ruhl Libre", "Noto Serif Hebrew", serif;
      }

      .ist-language-toggle {
        border: 1px solid rgba(255,255,255,.35);
        background: rgba(255,255,255,.1);
        color: #fff;
        padding: 9px 14px;
        border-radius: 10px;
        font: 700 14px Inter, Arial, sans-serif;
        cursor: pointer;
        transition: transform .2s, background .2s, color .2s;
      }
      .ist-language-toggle:hover {
        background: #c8a96b;
        color: #111;
        transform: translateY(-1px);
      }
      body > .ist-language-toggle {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 4000;
        background: #0f1f35;
      }

      html[dir="rtl"] body {
        font-family: var(--ist-hebrew-ui) !important;
        line-height: 1.72;
        letter-spacing: 0;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
      }

      html[dir="rtl"] button,
      html[dir="rtl"] input,
      html[dir="rtl"] textarea,
      html[dir="rtl"] select,
      html[dir="rtl"] .ist-language-toggle,
      html[dir="rtl"] .account-menu-button,
      html[dir="rtl"] .comment-input-box textarea {
        font-family: var(--ist-hebrew-ui) !important;
      }

      html[dir="rtl"] h1,
      html[dir="rtl"] h2,
      html[dir="rtl"] h3,
      html[dir="rtl"] .hero h1,
      html[dir="rtl"] .section-title h2,
      html[dir="rtl"] .comments-title,
      html[dir="rtl"] footer h2,
      html[dir="rtl"] footer h3 {
        font-family: var(--ist-hebrew-display) !important;
        font-weight: 700;
        line-height: 1.18;
        letter-spacing: 0 !important;
      }

      html[dir="rtl"] .card-title,
      html[dir="rtl"] .video-title,
      html[dir="rtl"] .shiur-title,
      html[dir="rtl"] .item-title,
      html[dir="rtl"] .related-title,
      html[dir="rtl"] .audio-player-card h2 {
        font-family: var(--ist-hebrew-ui) !important;
        font-weight: 700;
        line-height: 1.45;
        letter-spacing: 0 !important;
      }

      html[dir="rtl"] .hero-subtitle {
        font-family: var(--ist-hebrew-ui) !important;
        letter-spacing: .04em !important;
        text-transform: none !important;
        font-weight: 700;
      }

      html[dir="rtl"] .logo {
        direction: rtl;
      }
      html[dir="rtl"] .logo img {
        margin-right: 0 !important;
        margin-left: 12px !important;
      }
      html[dir="rtl"] .nav-links {
        direction: rtl;
      }
      html[dir="rtl"] .nav-links a {
        font-weight: 600;
      }
      html[dir="rtl"] .dropdown-menu {
        left: auto !important;
        right: 0;
        text-align: right;
      }
      html[dir="rtl"] .dropdown-menu a {
        text-align: right;
      }

      html[dir="rtl"] .card-info,
      html[dir="rtl"] .info,
      html[dir="rtl"] .shiur-details,
      html[dir="rtl"] .comments-section,
      html[dir="rtl"] .comment-card,
      html[dir="rtl"] .profile-box,
      html[dir="rtl"] .profile-row,
      html[dir="rtl"] .history-main,
      html[dir="rtl"] .related-info,
      html[dir="rtl"] .folder-filter-menu,
      html[dir="rtl"] .download-menu {
        text-align: right;
      }

      html[dir="rtl"] .folder-filter-button {
        text-align: right !important;
      }
      html[dir="rtl"] .folder-option,
      html[dir="rtl"] .topic-branch,
      html[dir="rtl"] .location-branch {
        direction: rtl;
        text-align: right;
      }
      html[dir="rtl"] .download-menu button {
        text-align: right !important;
        direction: rtl;
      }

      html[dir="rtl"] .action-bar,
      html[dir="rtl"] .secondary-actions,
      html[dir="rtl"] .item-actions,
      html[dir="rtl"] .comment-actions,
      html[dir="rtl"] .hero-buttons,
      html[dir="rtl"] .media-switch,
      html[dir="rtl"] .tab-buttons,
      html[dir="rtl"] .tabs {
        direction: rtl;
      }

      html[dir="rtl"] input,
      html[dir="rtl"] textarea,
      html[dir="rtl"] select {
        direction: rtl;
        text-align: right;
        unicode-bidi: plaintext;
      }
      html[dir="rtl"] input[type="email"],
      html[dir="rtl"] input[type="tel"],
      html[dir="rtl"] input[type="password"] {
        direction: ltr;
        text-align: left;
      }
      html[dir="rtl"] #search {
        direction: rtl;
        text-align: right;
        unicode-bidi: plaintext;
      }

      html[dir="rtl"] .details,
      html[dir="rtl"] .series,
      html[dir="rtl"] .shiur-meta,
      html[dir="rtl"] .history-meta,
      html[dir="rtl"] .player-meta,
      html[dir="rtl"] time {
        unicode-bidi: plaintext;
      }
      html[dir="rtl"] .view-counter-number,
      html[dir="rtl"] .flip-counter,
      html[dir="rtl"] .flip-digit,
      html[dir="rtl"] .flip-separator {
        direction: ltr;
        unicode-bidi: isolate;
      }

      html[dir="rtl"] .comment-submit-btn {
        align-self: flex-start !important;
      }
      html[dir="rtl"] .popup-close {
        right: auto !important;
        left: 14px !important;
      }
      html[dir="rtl"] body > .ist-language-toggle {
        right: auto;
        left: 18px;
      }

      @media (max-width: 900px) {
        .ist-language-toggle { width: auto; }
        html[dir="rtl"] .nav-links,
        html[dir="rtl"] .dropdown-menu a {
          text-align: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function startObserver() {
    observer = new MutationObserver(mutations => {
      if (currentLanguage !== "he") return;

      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
        }
        for (const node of mutation.addedNodes || []) translateTree(node);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.IST_I18N = {
    t,
    setLanguage: applyLanguage,
    getLanguage: () => currentLanguage,
    translate: translateTree,
    showcaseName: translateShowcaseName
  };

  const nativeAlert = window.alert.bind(window);
  const nativeConfirm = window.confirm.bind(window);
  window.alert = message => nativeAlert(translateValue(message));
  window.confirm = message => nativeConfirm(translateValue(message));

  function initializeI18n() {
    injectStyles();
    if (currentLanguage === "he") injectHebrewFonts();
    injectToggle();
    applyLanguage(currentLanguage);
    if (!observer) startObserver();
  }

  injectStyles();
  if (currentLanguage === "he") injectHebrewFonts();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeI18n, { once: true });
  } else {
    initializeI18n();
  }
})();
