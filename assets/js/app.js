const $=id=>document.getElementById(id);
const SKILLS=["ជំនាញកុំព្យូទ័រ និងបច្ចេកវិទ្យា","ភាសាអង់គ្លេស","បញ្ញាសិប្បនិម្មិត","ជំនាញដឹកនាំ និងគ្រប់គ្រង","ជំនាញទំនាក់ទំនង","ជំនាញបច្ចេកទេស","ផ្សេងៗ (សូមបញ្ជាក់)"];
const DEVELOPMENT=["ចំណេះដឹង","ជំនាញវិជ្ជាជីវៈ","ការដឹកនាំ","ការធ្វើការជាក្រុម","ការដោះស្រាយបញ្ហា"];
const SUPPORT=["រៀបចំវគ្គបណ្តុះបណ្តាល","ផ្តល់ឱកាសសិក្សាជំនាញថ្មី","ផ្តល់សម្ភារៈ និងឧបករណ៍","ផ្តល់ឱកាសអភិវឌ្ឍអាជីព"];
let sessionToken="", employee=null, submitting=false;
function show(view){["loginView","setupView","surveyView"].forEach(id=>$(id).classList.toggle("hidden",id!==view));}
function message(id,msg,ok=false){$(id).textContent=msg;$(id).classList.toggle("success",ok);}
async function api(action,data={}) {
  const url=window.APP_CONFIG.API_URL;
  if(!url||url.includes("PASTE_YOUR")) throw new Error("មិនទាន់កំណត់អាសយដ្ឋាន Google Apps Script API ទេ។");
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,...data})});
  const json=await res.json(); if(!json.ok) throw new Error(json.message||"មានបញ្ហាក្នុងការភ្ជាប់ប្រព័ន្ធ។"); return json;
}
function drawOptions(id,items,name){$(id).innerHTML=items.map((s,i)=>`<label class="option"><input type="checkbox" name="${name}" value="${s.replace(/"/g,"&quot;")}"><span>${s}</span></label>`).join("");}
function selected(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);}
drawOptions("skillsOptions",SKILLS,"skills");drawOptions("developmentOptions",DEVELOPMENT,"development");drawOptions("supportOptions",SUPPORT,"support");
$("skillsOptions").addEventListener("change",()=>{$("otherSkill").classList.toggle("hidden",!selected("skills").includes("ផ្សេងៗ (សូមបញ្ជាក់)"));});
$("togglePassword").onclick=()=>{$("password").type=$("password").type==="password"?"text":"password";$("togglePassword").textContent=$("password").type==="password"?"បង្ហាញ":"លាក់";};
$("firstTime").onclick=()=>show("setupView");document.querySelectorAll("[data-back]").forEach(b=>b.onclick=()=>show("loginView"));
$("loginForm").onsubmit=async e=>{e.preventDefault();message("loginMessage","កំពុងផ្ទៀងផ្ទាត់...");try{const r=await api("login",{staffId:$("staffId").value.trim().toUpperCase(),password:$("password").value});sessionToken=r.token;employee=r.employee;openSurvey();}catch(err){message("loginMessage",err.message);}};
$("setupForm").onsubmit=async e=>{e.preventDefault();if($("newPassword").value.length<8)return message("setupMessage","ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៨ តួអក្សរ។");if($("newPassword").value!==$("confirmPassword").value)return message("setupMessage","ពាក្យសម្ងាត់ទាំងពីរមិនដូចគ្នាទេ។");try{await api("activateAccount",{staffId:$("setupStaffId").value.trim().toUpperCase(),activationCode:$("activationCode").value,password:$("newPassword").value});message("setupMessage","បង្កើតពាក្យសម្ងាត់បានជោគជ័យ។ សូមចូលប្រើប្រាស់។",true);setTimeout(()=>show("loginView"),1200);}catch(err){message("setupMessage",err.message);}};
function openSurvey(){show("surveyView");$("employeeName").textContent=employee.name||employee.staffId;$("employeeMeta").textContent=[employee.staffId,employee.department,employee.position].filter(Boolean).join(" • ");}
$("logout").onclick=()=>{sessionToken="";employee=null;show("loginView");$("loginForm").reset();};
$("surveyForm").onsubmit=async e=>{e.preventDefault();if(submitting)return;const q1=selected("skills"),q2=selected("development"),q3=selected("support");if(!q1.length||!q2.length||!q3.length)return message("surveyMessage","សូមឆ្លើយសំណួរទី១ ទី២ និងទី៣ ជាមុនសិន។");if(q1.includes("ផ្សេងៗ (សូមបញ្ជាក់)")&&!$("otherSkill").value.trim())return message("surveyMessage","សូមបញ្ជាក់ជំនាញផ្សេងៗដែលអ្នកចង់រៀន។");if(!confirm("តើអ្នកប្រាកដថាចង់បញ្ជូនចម្លើយនេះឬទេ?"))return;submitting=true;try{await api("submitSurvey",{token:sessionToken,answers:{q1,q1Other:$("otherSkill").value.trim(),q2,q3,q4:$("comments").value.trim()}});message("surveyMessage","សូមអរគុណ! ចម្លើយរបស់អ្នកត្រូវបានរក្សាទុកដោយជោគជ័យ។",true);$("surveyForm").querySelectorAll("input,textarea,button").forEach(x=>x.disabled=true);}catch(err){message("surveyMessage",err.message);}finally{submitting=false;}};
