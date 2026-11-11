# ប្រព័ន្ធស្ទង់មតិការអភិវឌ្ឍសមត្ថភាពបុគ្គលិក (EPDS) v4.0

## អ្វីដែលផ្លាស់ប្តូរក្នុង v4.0
- ដកចេញ Activation Code, Register / Activate Account និងផ្ទាំងចុះឈ្មោះដោយបុគ្គលិកខ្លួនឯង
- គណនីបុគ្គលិកត្រូវបានបង្កើតជាមុន ដោយប្រើ Password បណ្តោះអាសន្ន `PRD001`
- បុគ្គលិកត្រូវប្តូរ Password ពេល Login លើកដំបូង (ហើយក្រោយពី HR Reset)
- Admin Dashboard មានផ្នែក **Employee Accounts**៖ បង្កើតគណនីថ្មី និង Reset Password (ទៅ `PRD001`)
- រក្សា Login, Employee Survey, Admin Dashboard, Search និង Export PDF/Excel ដូចដើម

## ដំឡើង / Upgrade
1. ជំនួសកូដ Apps Script ដោយ `Code.gs` (v4.0) រួច Save
2. Run `setupTemporaryAccounts()` **ម្តង** ក្នុង Apps Script Editor
   - បន្ថែមជួរ `Must_Change_Password` ក្នុង Sheet `Employees`
   - បុគ្គលិកដែលមិនទាន់មាន Password ទទួលបាន `PRD001` + ត្រូវប្តូរពេល Login ដំបូង
   - បុគ្គលិកដែលមាន Password ផ្ទាល់ខ្លួនរួចហើយ (ឧ. SAY VANNA) មិនត្រូវបានប៉ះពាល់
   - សម្អាតតម្លៃ `Activation_Code` ដែលលែងប្រើ
3. Deploy → Manage deployments → Edit → **New version** (ដើម្បីឱ្យ Web App ប្រើកូដថ្មី)
4. Upload `index.html`, `assets/css/style.css`, `assets/js/app.js` ទៅ GitHub Pages (`config.js` មិនចាំបាច់ប្តូរ)

## លំហូរការងារ
| ស្ថានភាព | Password | ត្រូវប្តូរ? |
|---|---|---|
| គណនីថ្មីដែល HR Admin បង្កើត | `PRD001` | បាទ/ចាស |
| HR Admin ចុច Reset Password | `PRD001` | បាទ/ចាស |
| បុគ្គលិកប្តូររួច | Password ថ្មី (≥ ៨ តួ, មិនមែន `PRD001`) | ទេ |

ប្រសិនបើបុគ្គលិកមិនទាន់ប្តូរ Password ទេ មិនអាចបញ្ជូនចម្លើយស្ទង់មតិបានទេ (ការពារទាំង Frontend និង Backend)។

## សុវត្ថិភាព
- Password ត្រូវរក្សាទុកជាអក្សរធម្មតាក្នុង Google Sheets តាមការស្នើសុំ។ ត្រូវកំណត់ Spreadsheet ជា Private។ ពេលអាច គួរប្តូរទៅ Hash។
- `PRD001` ជា Password ដែលមនុស្សគ្រប់គ្នាដឹង ដូច្នេះបុគ្គលិកគួរប្តូរភ្លាមៗ។ គណនីដែលនៅ `PRD001` អាចត្រូវបានគេចូលប្រើបាន ដរាបណាមិនទាន់ប្តូរ។
- Backend មិនបញ្ជូន Password ទៅ Browser ទេ។
