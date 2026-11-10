# ប្រព័ន្ធស្ទង់មតិការអភិវឌ្ឍសមត្ថភាពបុគ្គលិក (EPDS)

## អ្វីដែលមានក្នុងកញ្ចប់
- ផ្ទាំងចូលប្រើប្រាស់តាមគំរូរូបភាព
- បង្កើតពាក្យសម្ងាត់លើកដំបូងដោយលេខកូដសកម្មភាព
- កម្រងសំណួរ ៤ សំណួរ ជាភាសាខ្មែរ
- Frontend សម្រាប់ GitHub Pages
- Backend Google Apps Script
- CSV បុគ្គលិកឯកជន ដែលទាញយកតែ Staff ID និងឈ្មោះអង់គ្លេសពី PDF

## សំខាន់អំពីសុវត្ថិភាព
តាមការស្នើសុំរបស់ម្ចាស់ប្រព័ន្ធ កំណែនេះរក្សាទុក Password ជាអក្សរធម្មតាក្នុង Google Sheets។ វាមានហានិភ័យខ្ពស់ ប្រសិនបើអ្នកណាម្នាក់បានចូលដល់ Spreadsheet។ កំណត់ Spreadsheet ជា Private និងកុំចែករំលែក Sheet `Employees` ទៅ HR Admin ឬអ្នកប្រើផ្សេង។ កុំបញ្ចូល CSV ក្នុង Public GitHub Repository។

## ដំឡើង
1. បង្កើត Google Spreadsheet ថ្មី និងកំណត់សិទ្ធិជា Private។
2. បើក Extensions → Apps Script ហើយដាក់កូដពី `google-apps-script/Code.gs`។
3. កែ `SPREADSHEET_ID` និង `ADMIN_EMAIL` ក្នុង Code.gs។
4. Run `setupDatabase()` ម្តង ហើយអនុញ្ញាតសិទ្ធិ។
5. បញ្ចូល `private-import/employees_import.csv` ទៅ Sheet ថ្មីឈ្មោះ `Employees_Import`។ ប្រើ File → Import → Upload ក្នុង Google Sheets។
6. Run `importEmployeesFromSheet()` ដើម្បីនាំចូលបញ្ជីបុគ្គលិក។
7. កំណត់ `Activation_Code` ផ្ទាល់ខ្លួនសម្រាប់បុគ្គលិកម្នាក់ៗក្នុង Sheet `Employees` ហើយចែកជូនបុគ្គលិកតាមមធ្យោបាយឯកជន។ កុំប្រើលេខកូដដូចគ្នាសម្រាប់គ្រប់គ្នា។
8. Deploy → New deployment → Web app។ Execute as: Me. Who has access: Anyone (endpoint មានការផ្ទៀងផ្ទាត់នៅក្នុងកូដ)។
9. ចម្លង Web App URL ទៅ `assets/js/config.js` នៅ `API_URL`។
10. Upload តែ frontend ទៅ GitHub Repository ហើយបើក GitHub Pages ពី Settings → Pages → Deploy from branch។

## ចំណាំសំខាន់
- កុំដាក់ CSV ឯកជនក្នុង GitHub។ លុបថត `private-import` មុន Push ទៅ Public Repository។
- បញ្ជីបុគ្គលិកដែលបានស្រង់ពី PDF គឺ Staff ID និងឈ្មោះអង់គ្លេសតែប៉ុណ្ណោះ។ សូមពិនិត្យឈ្មោះ និងបំពេញ Department/Position មុនប្រើប្រាស់។
- កំណែនេះជាគម្រោងដំបូងដែលត្រូវការកំណត់ Google Sheet ID, Admin email, API URL និងពិនិត្យសុវត្ថិភាពមុនដាក់ប្រើប្រាស់ពិត។
- Apps Script `Session.getActiveUser()` អាចមិនបង្ហាញ email ក្នុង deployment ខ្លះៗ។ ត្រូវសាកល្បង Admin authorization ក្នុងបរិស្ថានរបស់អ្នក ហើយកុំចាត់ទុកថា Admin Dashboard រួចរាល់រហូតដល់បានសាកល្បង។
- ប្រសិនបើត្រូវការប្រើប្រាស់ជាផ្លូវការ គួរប្តូរ Password storage ទៅ Hash ហើយបន្ថែមការកំណត់សុវត្ថិភាពតាមការពិនិត្យបច្ចេកទេស។
