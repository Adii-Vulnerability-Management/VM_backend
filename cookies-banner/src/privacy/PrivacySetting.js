// import React, { useState, useEffect, useContext } from "react";
// import { MyContext } from "../context/Myprovider";

// function PrivacySetting(props) {
//   const { consentdata } = useContext(MyContext);
//   const { setCategoryChecked,toggleSwitch,categoryChecked,toggle,setToggle } = props;
//   // const [toggle, setToggle] = useState({});
//   const [cookiesData, setCookiesData] = useState(consentdata?.privacySettingData?.cookiesData);

//   const PrivacySettingCSS = `
//     .ma-1 { margin: 10px; }
//     .accordion { margin: auto; width: 100%; }
//     .accordion input { display: none; }
//     .box { position: relative; background: white; transition: all 0.15s ease-in-out; }
//     .box::before { content: ""; position: absolute; display: block; top: 0; bottom: 0; left: 0; right: 0; pointer-events: none; box-shadow: 0 -1px 0 #e5e5e5, 0 0 2px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.24); }
//     header.box { background: #00bcd4; z-index: 100; cursor: initial; box-shadow: 0 -1px 0 #e5e5e5, 0 0 2px -2px rgba(0, 0, 0, 0.12), 0 2px 4px -4px rgba(0, 0, 0, 0.24); }
//     header .box-title { margin: 0; font-weight: normal; font-size: 16pt; color: white; cursor: initial; line-height: 3em !important; }
//     .box-title { line-height: 3em !important; padding: 0 20px; display: inline-block; cursor: pointer; -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
//     .box-content { padding: 30px 20px; color: rgba(0, 0, 0, 0.54); display: none; }
//     .box-close { position: absolute; width: 100%; top: 0; left: 0; cursor: pointer; display: none; }
//     .box.open { height: auto; margin: 16px 0; box-shadow: 0 0 6px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.32); }
//     .box.open .box-title { border-bottom: 1px solid rgba(0, 0, 0, 0.18); }
//     .box.open .box-content, .box.open .box-close { display: inline-block; }
//     .arrows section .box-title { padding-left: 44px; width: calc(100% - 10px); }
//     .arrows section .box-title:before { position: absolute; display: block; content: "\\203a"; font-size: 18pt; left: 20px; top: -2px; transition: transform 0.15s ease-in-out; color: rgba(0, 0, 0, 0.54); }
//     .box.open .box-title:before { transform: rotate(90deg); }
//     input:checked + .box { height: auto; margin: 16px 0; box-shadow: 0 0 6px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.32); }
//     input:checked + .box .box-title { border-bottom: 1px solid rgba(0, 0, 0, 0.18); }
//     input:checked + .box .box-content, input:checked + .box .box-close { display: inline-block; }
//     .arrows section .box-title { padding-left: 44px; }
//     .arrows section .box-title:before { position: absolute; display: block; content: "▸"; font-size: 18pt; left: 20px; top: -2px; transition: transform 0.25s ease-in-out; color: rgba(0, 0, 0, 0.54); }
//     input:checked + section.box .box-title:before { transform: rotate(90deg); }
//     .cookie-declaration table td { border: 1px solid #ccc; overflow: hidden !important; white-space: normal !important; text-overflow: ellipsis !important; font-size: 12px; color: black; padding: 1rem; }
//     .cookie-declaration table th { font-size: 12px; text-align: center; color: black; }
//     .table_desc { max-height: 4rem; overflow-y: auto; overflow-x: hidden; }
//     .table_desc::-webkit-scrollbar { width: 2px; }
//     .table_desc::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.3); border-radius: 4px; }
//     .table_desc:empty { overflow: hidden; }
//     .category-checkbox-container { display: flex; align-items: center; margin: 0rem 0rem 2rem 0rem; }
//     .category-description { flex: 1; }
//     .checkbox-container { margin-left: 10px; }
//     .switch { position: relative; display: inline-block; width: 50px; height: 25px; }
//     .switch .inputphase { opacity: 0; width: 0; height: 0; }
//     .switch .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.4s; }
//     .switch .slider:before { position: absolute; content: ""; height: 15px; width: 15px; left: 4px; bottom: 4px; background-color: white; transition: 0.4s; }
//     .switch .inputphase:checked + .slider { background-color: #2196f3; }
//     .switch .inputphase:focus + .slider { box-shadow: 0 0 1px #2196f3; }
//     .switch .inputphase:checked + .slider:before { transform: translateX(26px); }
//     .switch .slider.round { border-radius: 34px; }
//     .switch .slider.round:before { border-radius: 50%; }
//   `;

//   useEffect(() => {
//     if (cookiesData) {
//       const categorizedCookies = cookiesData.reduce((acc, cookie) => {
//         if (!acc[cookie.category]) {
//           acc[cookie.category] = [];
//         }
//         acc[cookie.category].push(cookie);
//         return acc;
//       }, {});
      
//       setToggle(Object.fromEntries(Object.keys(categorizedCookies).map((category) => [category, false])));
//       setCategoryChecked(Object.fromEntries(Object.keys(categorizedCookies).map((category) => [category, category === 'Necessary'])));
//     }
//     console.log('toggle',toggle)

//   }, [cookiesData, setToggle, setCategoryChecked]);

//   const toggleAccordion = (category) => {
//     setToggle((prevState) => ({
//       ...prevState,
//       [category]: !prevState[category]
//     }));

//   };

//   return (
//     <>
//       <style jsx>
//         {`
//           ${PrivacySettingCSS}
//         `}
//       </style>

//       <div>
//         <div>
//           <nav className="accordion arrows">
//             {Object.keys(toggle).map((category) => (
//               <div className="ma-1" key={category}>
//                 <input
//                   type="checkbox"
//                   name="accordion"
//                   id={`accordion-${category}`}
//                   // checked={toggle[category]}
//                   // onChange={() => toggleAccordion(category)}
//                   checked={categoryChecked[category]}
//                   onChange={() => toggleSwitch(category)}
//                   />
//                 <section className={`box ${toggle[category] ? "open" : ""}`}>
//                   <label
//                     className="box-title"
//                     htmlFor={`accordion-${category}`}
//                   >
//                     {category}
//                   </label>
//                   <div className="box-content">
//                     <div className="category-checkbox-container">
//                       <div className="category-description">
//                         {cookiesData?.find(cookie => cookie.category === category)?.category_desc}
//                       </div>
//                       <div className="checkbox-container">
//                         <label className="switch">
//                           <input
//                             type="checkbox"
//                             className="inputphase"
//                             checked={props.categoryChecked[category]}
//                             onChange={() => props.toggleSwitch(category)}
//                           />
//                           <span className="slider round"></span>
//                         </label>
//                       </div>
//                     </div>
//                     <div className="cookie-declaration">
//                       <table className="table_maincss">
//                         <thead>
//                           <tr>
//                             <th>Cookie ID</th>
//                             <th>Cookie Name</th>
//                             <th>Duration</th>
//                             <th>Description</th>
//                           </tr>
//                         </thead>
//                         <tbody>
//                           {cookiesData
//                             ?.filter((cookie) => cookie.category === category)
//                             .map((item, index) => (
//                               <tr key={index}>
//                                 <td>{item.cookie_id}</td>
//                                 <td>{item.cookie_name}</td>
//                                 <td>{item.duration}</td>
//                                 <td>
//                                   <div className="table_desc">
//                                     {item.description}
//                                   </div>
//                                 </td>
//                               </tr>
//                             ))}
//                         </tbody>
//                       </table>
//                     </div>
//                   </div>
//                 </section>
//               </div>
//             ))}
//           </nav>
//         </div>
//       </div>
//     </>
//   );
// }

// export default PrivacySetting;

import React, { useState, useEffect, useContext } from "react";
import { MyContext } from "../context/Myprovider";

function PrivacySetting(props) {
  const { consentdata } = useContext(MyContext);
  const { toggle, setToggle, setCategoryChecked } = props;
  
  const PrivacySettingCSS = `
    .ma-1 { margin: 10px; }
    .accordion { margin: auto; width: 100%; }
    .accordion input { display: none; }
    .box { position: relative; background: white; transition: all 0.15s ease-in-out; }
    .box::before { content: ""; position: absolute; display: block; top: 0; bottom: 0; left: 0; right: 0; pointer-events: none; box-shadow: 0 -1px 0 #e5e5e5, 0 0 2px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.24); }
    header.box { background: #00bcd4; z-index: 100; cursor: initial; box-shadow: 0 -1px 0 #e5e5e5, 0 0 2px -2px rgba(0, 0, 0, 0.12), 0 2px 4px -4px rgba(0, 0, 0, 0.24); }
    header .box-title { margin: 0; font-weight: normal; font-size: 16pt; color: white; cursor: initial; line-height: 3em !important; }
    .box-title { line-height: 3em !important; padding: 0 20px; display: inline-block; cursor: pointer; -webkit-touch-callout: none; -webkit-user-select: none; -khtml-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
    .box-content { padding: 30px 20px; color: rgba(0, 0, 0, 0.54); display: none; }
    .box-close { position: absolute; width: 100%; top: 0; left: 0; cursor: pointer; display: none; }
    .box.open { height: auto; margin: 16px 0; box-shadow: 0 0 6px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.32); }
    .box.open .box-title { border-bottom: 1px solid rgba(0, 0, 0, 0.18); }
    .box.open .box-content, .box.open .box-close { display: inline-block; }
    .arrows section .box-title { padding-left: 44px; width: calc(100% - 10px); }
    .arrows section .box-title:before { position: absolute; display: block; content: "\\203a"; font-size: 18pt; left: 20px; top: -2px; transition: transform 0.15s ease-in-out; color: rgba(0, 0, 0, 0.54); }
    .box.open .box-title:before { transform: rotate(90deg); }
    input:checked + .box { height: auto; margin: 16px 0; box-shadow: 0 0 6px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.32); }
    input:checked + .box .box-title { border-bottom: 1px solid rgba(0, 0, 0, 0.18); }
    input:checked + .box .box-content, input:checked + .box .box-close { display: inline-block; }
    .arrows section .box-title { padding-left: 44px; }
    .arrows section .box-title:before { position: absolute; display: block; content: "▸"; font-size: 18pt; left: 20px; top: -2px; transition: transform 0.25s ease-in-out; color: rgba(0, 0, 0, 0.54); }
    input:checked + section.box .box-title:before { transform: rotate(90deg); }
    .cookie-declaration table td { border: 1px solid #ccc; overflow: hidden !important; white-space: normal !important; text-overflow: ellipsis !important; font-size: 12px; color: black; padding: 1rem; }
    .cookie-declaration table th { font-size: 12px; text-align: center; color: black; }
    .table_desc { max-height: 4rem; overflow-y: auto; overflow-x: hidden; }
    .table_desc::-webkit-scrollbar { width: 2px; }
    .table_desc::-webkit-scrollbar-thumb { background-color: rgba(0, 0, 0, 0.3); border-radius: 4px; }
    .table_desc:empty { overflow: hidden; }
    .category-checkbox-container { display: flex; align-items: center; margin: 0rem 0rem 2rem 0rem; }
    .category-description { flex: 1; }
    .checkbox-container { margin-left: 10px; }
    .switch { position: relative; display: inline-block; width: 50px; height: 25px; }
    .switch .inputphase { opacity: 0; width: 0; height: 0; }
    .switch .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.4s; }
    .switch .slider:before { position: absolute; content: ""; height: 15px; width: 15px; left: 4px; bottom: 4px; background-color: white; transition: 0.4s; }
    .switch .inputphase:checked + .slider { background-color: #2196f3; }
    .switch .inputphase:focus + .slider { box-shadow: 0 0 1px #2196f3; }
    .switch .inputphase:checked + .slider:before { transform: translateX(26px); }
    .switch .slider.round { border-radius: 34px; }
    .switch .slider.round:before { border-radius: 50%; }
  `;

  const [cookiesData, setCookiesData] = useState(consentdata?.privacySettingData?.cookiesData);

console.log('privacysetting',consentdata.privacySettingData)


  useEffect(() => {
    if (cookiesData) {
      const categorizedCookies = cookiesData.reduce((acc, cookie) => {
        if (!acc[cookie.category]) {
          acc[cookie.category] = [];
        }
        acc[cookie.category].push(cookie);
        return acc;
      }, {});
      
      setToggle(Object.fromEntries(Object.keys(categorizedCookies).map((category) => [category, false])));
      setCategoryChecked(Object.fromEntries(Object.keys(categorizedCookies).map((category) => [category, category === 'Necessary'])));
    }
  }, [cookiesData, setToggle, setCategoryChecked]);



  const toggleAccordion = (category) => {
    setToggle((prevState) => ({
      ...prevState,
      [category]: !prevState[category]
    }));
    console.log(toggle)
  };
  return (
    <>
      <style jsx>
        {`
          ${PrivacySettingCSS}
        `}
      </style>

      <div>
        <div>
          <nav className="accordion arrows">
            {Object.keys(toggle).map((category) => (
              <div className="ma-1" key={category}>
                <input
                  type="radio"
                  name="accordion"
                  id={`accordion-${category}`}
                  checked={toggle[category]}
                  onChange={() => toggleAccordion(category)}
                />
                <section className={`box ${toggle[category] ? "open" : ""}`}>
                  <label
                    className="box-title"
                    htmlFor={`accordion-${category}`}
                    onClick={() => toggleAccordion(category)}
                  >
                    {category}
                  </label>
                  <div className="box-content">
                    <div className="category-checkbox-container">
                      <div className="category-description">
                        {cookiesData?.find(cookie => cookie.category === category)?.category_desc}
                      </div>
                      <div className="checkbox-container">
                        <label className="switch">
                          <input
                            type="checkbox"
                            className="inputphase"
                            checked={props.categoryChecked[category]}
                            onChange={() => props.toggleSwitch(category)}
                          />
                          <span className="slider round"></span>
                        </label>
                      </div>
                    </div>
                    <div className="cookie-declaration">
                      <table className="table_maincss">
                        <thead>
                          <tr>
                            <th>Cookie ID</th>
                            <th>Cookie Name</th>
                            <th>Duration</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cookiesData
                            ?.filter((cookie) => cookie.category === category)
                            .map((item, index) => (
                              <tr key={index}>
                                <td>{item.cookie_id}</td>
                                <td>{item.cookie_name}</td>
                                <td>{item.duration}</td>
                                <td>
                                  <div className="table_desc">
                                    {item.description}
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}

export default PrivacySetting;