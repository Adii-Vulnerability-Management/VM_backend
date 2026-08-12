import React, { useContext, useEffect, useState } from "react";

function CookiesForm(props) {
  const { formData, setFormData, handleSubmitCookiesData } = props;
  const [countryData, setCountryData] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);


  const CookiesFormCSS = `
          #webForm {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          .flexdiv {
            display: flex;
          }
          /* Styling form groups */
          .form-group {
            margin: 0.3rem;
            width: 50%;
            flex-basis: 50;
          }

          /* Styling labels */
          label {
            display: block;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 5px;
          }

          /* Styling input fields */
          input[type="text"],
          input[type="email"],
          select,
          textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            font-size: 14px;
            margin-bottom: 10px;
          }

          /* Styling file upload */
          .file-upload input[type="file"] {
            display: none;
          }

          .file-upload label {
            padding: 10px 15px;
            background-color: #007bff;
            color: #fff;
            border-radius: 5px;
            cursor: pointer;
            display: inline-block;
            margin-bottom: 10px;
          }

          .file-upload label:hover {
            background-color: #0056b3;
          }

          /* Styling submit button */
          button[type="submit"] {
            padding: 12px 20px;
            background-color: #007bff;
            color: #fff;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
          }

          button[type="submit"]:hover {
            background-color: #0056b3;
          }
        `

  useEffect(() => {
    if (!isHydrated) {
      setIsHydrated(true);
      return;
    }

    const fetchData = async () => {
      try {
        const response = await fetch("https://countriesnow.space/api/v0.1/countries/codes");
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await response.json();
        const countryOptions = data.data.map((country) => ({
          value: country.name,
          label: country.name,
        }));
        setCountryData(countryOptions);
      } catch (error) {
        console.error('Fetch error:', error);
      }
    };

    fetchData();
  }, [isHydrated]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    console.log('name',name)
    console.log('value',value)
    if (name === "document") {
      setFormData((prevData) => ({ ...prevData, [name]: files[0] }));
    } else {
      setFormData((prevData) => ({ ...prevData, [name]: value }));
    }
    // setFormData((prevData) => ({
    //   ...prevData,
    //   [name]: value,
    // }));
  };
  const handleSelectChange = (selectedOption, name) => {
    setFormData((prevData) => ({
      ...prevData,
      [name]: selectedOption,
    }));
  };

  // const handleSubmitCookiesData = (e) => {
  //   e.preventDefault();
  //   console.log("Form Data:", formData);
  //   // Here you can submit the form data to your backend
  // };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    console.log('file',file)
    setFormData((prevData) => ({
      ...prevData,
      document: file,
    }));
  };

  return (
    <>
      <style jsx>
        {`
      ${CookiesFormCSS}
      `}
      </style>

      <div>
        <form id="webForm" onSubmit={handleSubmitCookiesData}>
          <div className="flexdiv">
            <div className="form-group">
              <label for="usertype" className="labelform requiredicon">
                I am:
              </label>
              <select
                id="usertype"
                name="usertype"
                value={formData.usertype}
                onChange={(e) => handleSelectChange(e.target.value, "usertype")}
              >
                <option value="">Select User</option>
                <option value="Contractors">Contractors</option>
                <option value="Employees">Employees</option>
                <option value="Customers">Customers</option>
                <option value="Prospective employees">
                  Prospective employees
                </option>
              </select>
            </div>
            <div className="form-group">
              <label for="requesttype" className=" labelform requiredicon">
                Select request type(s):
              </label>
              <select
                id="requesttype"
                name="requesttype"
                value={formData.requesttype}
                onChange={(e) =>
                  handleSelectChange(e.target.value, "requesttype")
                }
              >
                <option value="">Select Request</option>
                <option value="Review Automated Decision">
                  Review Automated Decision
                </option>
                <option value="Update Data">Update Data</option>
                <option value="Data Deletion">Data Deletion</option>
                <option value="Object to Processing">
                  Object to Processing
                </option>
                <option value="File a complaint">File a complaint</option>
                <option value="Info Request">Info Request</option>
                <option value="Data Portability">Data Portability</option>
                <option value="Restrict Processing">Restrict Processing</option>
                <option value="Opt Out">Opt Out</option>
              </select>
            </div>
          </div>
          <div className="flexdiv">
            <div className="form-group">
              <label for="firstname" className="labelform requiredicon">
                First Name:
              </label>
              <input
                type="text"
                id="firstname"
                name="firstname"
                value={formData.firstname}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label for="lastname" className=" labelform requiredicon">
                Last Name:
              </label>
              <input
                type="text"
                id="lastname"
                name="lastname"
                value={formData.lastname}
                onChange={handleInputChange}
                required
              />
            </div>
          </div>
          <div className="flexdiv">
            <div className="form-group">
              <label for="contact_email" className=" labelform requiredicon">
                Email Address:
              </label>
              <input
                type="email"
                id="contact_email"
                name="contact_email"
                value={formData.contact_email}
                onChange={handleInputChange}
                required
              />
            </div>
            <div className="form-group">
              <label for="country" className="labelform requiredicon">
                Country:
              </label>
              <select
                name="country"
                value={formData.country}
                onChange={(e) => handleSelectChange(e.target.value, "country")}
              >
                <option value="">Select Country</option>
                {countryData &&
                  countryData.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flexdiv">
            <div className="form-group">
              <label for="description" className="labelform requiredicon">
                Request Detail:
              </label>
              <textarea
                id="description"
                name="description"
                rows="2"
                value={formData.description}
                onChange={handleInputChange}
                required
              ></textarea>
            </div>
            <div className="form-group ">
              <label for="document" className="labelform requiredicon">
                Upload File:
              </label>
              <input
                type="file"
                id="document"
                name="document"
                // onChange={handleInputChange}
                onChange={handleFileChange}
                required
              />
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

export default CookiesForm;

// import React from "react";

// function CookiesForm() {
//   return (
//     <>
//       <style jsx>
//         {`
//           #webForm {
//             max-width: 600px;
//             margin: 0 auto;
//             padding: 20px;
//             background-color: #f9f9f9;
//             border-radius: 8px;
//             box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
//           }
//           .flexdiv {
//             display: flex;
//           }
//           /* Styling form groups */
//           .form-group {
//             margin: 0.3rem;
//             width: 50%;
//             flex-basis: 50;
//           }

//           /* Styling labels */
//           label {
//             display: block;
//             font-size: 14px;
//             font-weight: bold;
//             margin-bottom: 5px;
//           }

//           /* Styling input fields */
//           input[type="text"],
//           input[type="email"],
//           select,
//           textarea {
//             width: 100%;
//             padding: 10px;
//             border: 1px solid #ccc;
//             border-radius: 5px;
//             font-size: 14px;
//             margin-bottom: 10px;
//           }

//           /* Styling file upload */
//           .file-upload input[type="file"] {
//             display: none;
//           }

//           .file-upload label {
//             padding: 10px 15px;
//             background-color: #007bff;
//             color: #fff;
//             border-radius: 5px;
//             cursor: pointer;
//             display: inline-block;
//             margin-bottom: 10px;
//           }

//           .file-upload label:hover {
//             background-color: #0056b3;
//           }

//           /* Styling submit button */
//           button[type="submit"] {
//             padding: 12px 20px;
//             background-color: #007bff;
//             color: #fff;
//             border: none;
//             border-radius: 5px;
//             font-size: 16px;
//             cursor: pointer;
//           }

//           button[type="submit"]:hover {
//             background-color: #0056b3;
//           }
//         `}
//       </style>
//       <div>
//         <form id="webForm" method="POST" action="/submit-form">
//           <div className="flexdiv">
//             <div className="form-group">
//               <label for="usertype" className=" requiredicon">
//                 I am:
//               </label>
//               <select id="usertype" name="usertype">
//                 <option value="Contractors">Contractors</option>
//                 <option value="Employees">Employees</option>
//                 <option value="Customers">Customers</option>
//                 <option value="Prospective employees">
//                   Prospective employees
//                 </option>
//               </select>
//             </div>
//             <div className="form-group">
//               <label for="requesttype" className="requiredicon">
//                 Select request type(s):
//               </label>
//               <select id="requesttype" name="requesttype">
//                 <option value="Review Automated Decision">
//                   Review Automated Decision
//                 </option>
//                 <option value="Update Data">Update Data</option>
//                 <option value="Data Deletion">Data Deletion</option>
//                 <option value="Object to Processing">
//                   Object to Processing
//                 </option>
//                 <option value="File a complaint">File a complaint</option>
//                 <option value="Info Request">Info Request</option>
//                 <option value="Data Portability">Data Portability</option>
//                 <option value="Restrict Processing">Restrict Processing</option>
//                 <option value="Opt Out">Opt Out</option>
//               </select>
//             </div>
//           </div>
//           <div className="flexdiv">
//             <div className="form-group">
//               <label for="firstname" className=" requiredicon">
//                 First Name:
//               </label>
//               <input type="text" id="firstname" name="firstname" required />
//             </div>

//             <div className="form-group">
//               <label for="lastname" className=" requiredicon">
//                 Last Name:
//               </label>
//               <input type="text" id="lastname" name="lastname" required />
//             </div>
//           </div>
//           <div className="flexdiv">
//             <div className="form-group">
//               <label for="contact_email" className=" requiredicon">
//                 Email Address:
//               </label>
//               <input
//                 type="email"
//                 id="contact_email"
//                 name="contact_email"
//                 required
//               />
//             </div>
//             <div className="form-group">
//               <label for="country" className=" requiredicon">
//                 Country:
//               </label>
//               <select id="country" name="country"></select>
//             </div>
//           </div>
//           <div className="flexdiv">
//             <div className="form-group">
//               <label for="description" className=" requiredicon">
//                 Request Detail:
//               </label>
//               <textarea
//                 id="description"
//                 name="description"
//                 rows="2"
//                 required
//               ></textarea>
//             </div>
//             <div className="form-group ">
//               <label for="fileupload" className=" requiredicon">
//                 Upload File:
//               </label>
//               <input type="file" id="fileupload" name="fileupload" required />
//             </div>
//           </div>
//           <button type="submit">Save</button>
//         </form>
//       </div>
//     </>
//   );
// }

// export default CookiesForm;
