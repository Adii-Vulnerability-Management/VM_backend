import React, { useState, useEffect, useContext } from 'react';
import PrivacySetting from './PrivacySetting';
import CookiesForm from './CookiesForm';
import { MyContext } from '../context/Myprovider';
import { DefaultData } from '../DefaultData';
import { baseurl, initURL } from '..';

const Consent = (props) => {
  const { consentdata } = useContext(MyContext);

  console.log('consentdata123check', consentdata);

  const parentkey = consentdata?.consentBannerData;

  console.log('parentkey', parentkey);

  const CokkiesDetailCSS = `
  .cookie-declaration {
    .table_maincss{
      border-spacing: 0;
      border-collapse: collapse;
      @media (max-width: 600px) {
.cookie-declaration .table_maincss {
  overflow-x: auto;
}

/* Custom webkit scrollbar for small screens */
.cookie-declaration .table_desc::-webkit-scrollbar {
  width: 6px;
}

.cookie-declaration .table_desc::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}
}

    }
    }
    table td {
      border: 1px solid #ccc;
      overflow: hidden !important;
      white-space: normal !important;
      text-overflow: ellipsis !important;
      font-size: 12px;
      color: black;
      padding: 1rem;
      
    }
    table th {
      font-size: 12px;

      text-align: center; /* Center align the content of th */
      color: black;
    }

    .table_desc {
      max-height: 4rem;
      overflow-y: auto; /* Automatically show scrollbar if content exceeds max-height */
      overflow-x: hidden; /* Hide horizontal scrollbar */
    }

    .table_desc::-webkit-scrollbar {
      width: 2px; /* Width of the scrollbar */
    }

    .table_desc::-webkit-scrollbar-thumb {
      background-color: rgba(
        0,
        0,
        0,
        0.3
      );
      border-radius: 1px; 
    }
    .table_desc:empty {
      overflow: hidden;
    }
  }

`;
  const ConsentCSS = `
.modalnav {
  list-style-type: none;
  padding: 0;
  margin: 0;
  width: 100%;
}

.navItem {
  display: inline-block;
}

.navLink {
  background-color: #f2f2f2;
  border: 1px solid #ccc;
  padding: 0.3rem 2rem;
  cursor: pointer;

  &.active {
    background-color: black;
    color: white;
    border-bottom: 1px solid #fff;
  }
}

/* Styles for tab content */
.tab-pane {
  display: none;

  &.active {
    display: block;
  }
}


input[type="color"]::-webkit-color-swatch {
border-radius: 100%; /* Example border radius to make it round */
}
input[type="color"]{
background-color:transparent;
border:none;
background:none;
height: 1.8em;
width: 2em;
cursor:pointer;
}
.child_ColorPicker {
width: fit-content;
border-radius: 5px !important;
box-shadow: inset 20 10 30 rgb(172 78 78 / 10%);
background-color: #cacac14d;
box-shadow: #c71f1f;
padding: 0.4rem 1rem;
margin: 1rem 0.16rem;
flex: auto;

}
.child_ColorPicker label {
color: #000;
font-weight: 600;
}
.ColorPicke_text{
border: 1px solid;
background-color: mintcream;
border-radius: 3px;
padding: 0.1em 0.3em;
color: black;
margin: 0 0.5rem 0 0;
}
.cookie-consent {
  position: fixed;
  bottom: 2rem;
  left: 0;
  width: 100%;
  padding: 0 1.5rem;
  box-sizing: border-box;
  z-index: 999;
}

.cookie-consent-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  padding: 1.25rem;
  border-radius: 0.3125rem;
  background-color: #f9f9f9;

  h2 {
    margin-top: 0;
  }
}

.close {
  color: #dc1111;
  float: right;
  font-size: 2rem;
  font-weight: 400;
}

.close:hover,
.close:focus {
  color: #000;
  text-decoration: none;
  cursor: pointer;
}
 .consent_description{
  color: rgb(0, 0, 0);
  font-family: Roboto, "Open Sans", Arial, Helvetica;
  font-size: calc(14px);
}


.modal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  // background-color: rgba(0, 0, 0, 0.25);
}

.modal-container {
  max-height: 80vh;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
  background-color: #fff;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 15px 30px 0 rgba(0, 0, 0, 0.25);
  @media (max-width: 600px) {
    width: 90%;
  }
}

.modal-container-header {
  padding: 16px 32px;
  border-bottom: 1px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-container-title {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1;
  font-weight: 700;
  font-size: 1.125;
  svg {
    width: 32px;
    height: 32px;
    color: #750550;
  }
}

.modal-container-body {
  padding: 1rem 1.1rem 2rem;
  overflow-y: scroll;
  overflow-x: hidden;
}

.modal-container-footer {
  padding: 20px 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  border-top: 1px solid #ddd;
  gap: 12px;
  position: relative;
  &:after {
    content: "";
    display: block;
    position: absolute;
    top: -51px;
    left: 24px;
    right: 24px;
    height: 50px;
    flex-shrink: 0;
    background-image: linear-gradient(
      to top,
      rgba(255, 255, 255, 0.75),
      transparent
    );
    pointer-events: none;
  }
}

.c_button {
  padding: 10px 20px;
  border-radius: 8px;
  background-color: transparent;
  border: 0;
  font-weight: 600;
  cursor: pointer;
  transition: 0.15s ease;

  &.is-ghost {
    &:hover,
    &:focus {
      background-color: #dfdad7;
    }
  }

  &.is-primary {
    background-color: #750550;
    color: #fff;
    &:hover,
    &:focus {
      background-color: #4a0433;
    }
  }
}

.icon-button {
  padding: 0;
  border: 0;
  background-color: transparent;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  cursor: pointer;
  border-radius: 8px;
  transition: 0.15s ease;
  svg {
    width: 24px;
    height: 24px;
  }

  &:hover,
  &:focus {
    background-color: #dfdad7;
  }
}
.consted_data {
  max-width: 60%;
  /* flexBasis: auto; */
  margin-bottom: 1em;
}

.content_button {
  max-width: 40%;
  flex-basis: auto;
  margin-bottom: 1em;
}

@media (max-width: 768px) {
  .consted_data {
    max-width: 100%;
  }

  .content_button {
    max-width: 100%;
  }
}


@media (max-width: 768px) {

.cookie-consent {
padding: 0.5rem;
bottom: 0;
}

.cookie-consent-content {
flex-direction: column;
align-items: stretch;
}

.cookie-consent-content > div {
width: 100%;
margin-bottom: 1rem;
}

.modal-container {
max-width: 100%;
border-radius: 0;
}

.modal-container-footer {
flex-direction: column;
align-items: stretch;
gap: 1rem;
padding: 1rem;
&:after {
display: none;
}
}


.c_button,
.icon-button {
width: 100%;
}
}
`;

  const [ip, setIp] = useState('');
  const [cookiesAccepted, setCookiesAccepted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [categoryChecked, setCategoryChecked] = useState({});
  const [toggle, setToggle] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [validateForm, setValidationFn] = useState(() => () => true);
  const [isSessionChecked, setIsSessionChecked] = useState(false); // Ensures UI waits for check

  const [formData, setFormData] = useState({
    usertype: null,
    requesttype: null,
    firstname: '',
    lastname: '',
    contact_email: '',
    country: null,
    description: '',
    document: null,
  });

  const toggleSwitch = (category) => {
    console.log(category, 'categorynameclicked');
    console.log(categoryChecked, 'categoryChecked');
    setCategoryChecked((prevState) => ({
      ...prevState,
      [category]: !prevState[category],
    }));
    console.log(categoryChecked, 'categoryChecked');
  };


  const getCookie = (name) => {
    const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
      const [key, value] = cookie.split('=');
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
  
    return cookies[name] || null;
  };
  

// Poll for the sessionId cookie
const waitForSessionId = (retries = 5, interval = 500) => {
  let attempts = 0;

  const intervalId = setInterval(() => {
    const sessionId = getCookie('sessionId');
    console.log('Polling for sessionId:', sessionId);

    if (sessionId || attempts >= retries) {
      clearInterval(intervalId);

      if (sessionId) {
        console.log('Session ID found:', sessionId);
        setCookiesAccepted(true); // Hide banner
      } else {
        console.log('Session ID not found after retries.');
        setCookiesAccepted(false); // Show banner
      }
    }

    attempts += 1;
  }, interval);
};




useEffect(() => {
  const checkSession = async () => {
    const sessionId = await getSessionIdFromServer();
    if (sessionId) {
      setCookiesAccepted(true);
    }
    setIsSessionChecked(true); // ✅ Mark session check as done
  };

  checkSession();
}, []);

  
  useEffect(() => {
    console.log('Updated categoryChecked:', categoryChecked);
    // Any additional logic dependent on categoryChecked
  }, [categoryChecked]);

  // console.log('consentdata',consentdata)
  // console.log('DefaultData',DefaultData)
  const userId = DefaultData.user_uuid;

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    console.log(`Active tab changed to: ${tabId}`);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setCookiesAccepted(true);
    // const iframe = document.getElementById(userId);
    // iframe.style.height = '16.5rem';
  };

  // const handleCookieConsent = async (actiontype, consent) => {
  //   console.log('inside axios func');
  //   try {
  //     console.log('inside try');
  //     const response = await fetch(
  //       `${baseurl}/${initURL}/cookies-banner/cookies-consent-data/${userId}`,
  //       {
  //         method: 'POST',
  //         credentials: 'include', // Include cookies for cross-origin requests
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           actiontype,
  //           consent,
  //         }),
  //       },
  //     );

  //     if (response.ok) {
  //       // const sessionId = getCookie('sessionId'); // Retrieve the sessionId after setting it
  //       // console.log('Session ID after consent:', sessionId);
  //       checkSessionIdCookie(); // Retry to find the cookie after backend response
  //       setCookiesAccepted(true); // Hide the banner
  //     } else {
  //       throw new Error('Failed to save consent data.');
  //     }

  //   } catch (error) {
  //     console.error(`Error in ${actiontype.toLowerCase()} cookies`, error);
  //   }
  // };


// Handle cookie consent

const handleCookieConsent = async (actiontype, consent) => {
  console.log('Inside handleCookieConsent');

  try {
    const response = await fetch(
      `${baseurl}/${initURL}/cookies-banner/cookies-consent-data/${userId}`,
      {
        method: 'POST',
        credentials: 'include', // Important for cross-origin cookies
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actiontype,
          consent,
        }),
      }
    );

    if (response.ok) {
      console.log(`${actiontype} cookies accepted`);

      // ** Manually Save Session ID Cookie in Browser **
      document.cookie = `sessionId=${userId}; path=/; Secure; SameSite=None; Max-Age=31536000`;

      // Fetch sessionId again after user accepts consent
      const sessionId = await getSessionIdFromServer();
      
      if (sessionId) {
        setCookiesAccepted(true); // Hide the banner
      } else {
        console.error('❌ Session ID not found after accept.');
      }
    } else {
      console.error('❌ Failed to save consent data.', await response.text());
    }
  } catch (error) {
    console.error('❌ Error in handleCookieConsent:', error.message);
  }
};
  

const getSessionIdFromServer = async () => {
  // ** Check Client-side Cookies First **
  let sessionId = getCookie('sessionId');

  if (sessionId) {
    console.log('🟢 Found sessionId in browser cookies:', sessionId);
    setCookiesAccepted(true);
    return sessionId;
  }

  try {
    console.log('⚪ No sessionId in browser, requesting from backend...');
    const response = await fetch(`${baseurl}/${initURL}/cookies-banner/get-session`, {
      method: 'GET',
      credentials: 'include', // Required for cross-origin cookies
    });

    if (!response.ok) throw new Error('Failed to get session ID');

    const data = await response.json();
    console.log('🟢 Session ID from server:', data.sessionId);

    if (data.sessionId) {
      document.cookie = `sessionId=${data.sessionId}; path=/; Secure; SameSite=None; Max-Age=31536000`;
      setCookiesAccepted(true); // Hide banner
    }

    return data.sessionId;
  } catch (error) {
    console.error('❌ Error fetching session ID:', error);
  } finally {
    setIsSessionChecked(true); // Mark session check as completed
  }
};

useEffect(() => {
  getSessionIdFromServer();
}, []);

  // 🔴 Prevents flashing: Only render after session check completes
  if (!isSessionChecked) {
    return null; // 🔥 Prevents rendering ANYTHING until the session check is done
  }


  const handleCustomize = () => {
    console.log('inside customize');
    const iframe = document.getElementById(userId);
    console.log(iframe, 'iframe');
    iframe.style.height = '100vh';
    setShowModal(true);
    setCookiesAccepted(true);
    // handleCookieConsent("Customize", categoryChecked);
  };
  const handleAcceptCookies = () => {
    console.log('inside Accept cokkie');

    // setShowModal(false);
    // setCookiesAccepted(true);
    // const iframe1 = document.getElementById(userId);
    // // console.log('iframe1', iframe1);
    // // console.log('userId', userId);
    // const iframe = document.getElementById(userId);
    // // console.log('iframe', iframe);
    // iframe.style.height = '3.5rem';
    handleCookieConsent('Accept All', {});
  };

  const handleRejectCookies = () => {
    // console.log('handleRejectCookies called bitton click');
    // setCookiesAccepted(true);
    // const iframe = document.getElementById(userId);
    // iframe.style.height = '3.5rem';
    handleCookieConsent('Reject All', {});
  };

  // const handleAcceptCookiesData = () => {
  //   // setShowModal(false);
  //   // setCookiesAccepted(true);
  //   // const iframe = document.getElementById(userId)
  //   // iframe.style.display = "none"

  //   console.log('inside handleAcceptCookiesData');
  //   const iframe = document.getElementById(userId);
  //   console.log(iframe, 'iframe');
  //   iframe.style.height = '100vh';
  //   setShowModal(true);
  //   setCookiesAccepted(true);
  //   handleCookieConsent('Customize', categoryChecked);
  // };

  const handleAcceptCookiesData = async () => {
    console.log('inside handleAcceptCookiesData');
  
    // Prevent multiple clicks
    setCookiesAccepted(true); // ✅ Hide the banner
    setShowModal(false); // ✅ Close the modal
  
    try {
      await handleCookieConsent('Customize', categoryChecked); // ✅ Wait for API request to complete
      console.log("Consent submitted successfully");
    } catch (error) {
      console.error("Error submitting consent:", error);
    }
  };
  

  // const handleSubmitCookiesData = async () => {
  //   console.log('formData', formData);

  //   const data = new FormData();
  //   Object.keys(formData).forEach((key) => {
  //     data.append(key, formData[key]);
  //   });

  //   try {
  //     const response = await fetch(
  //       `${baseurl}/${initURL}/cookies-banner/cookies-req-data/${userId}`,
  //       {
  //         method: 'POST',
  //         body: data,
  //       },
  //     );

  //     if (!response.ok) {
  //       throw new Error('Failed to submit data');
  //     }

  //     // Handle success (e.g., show success message, reset form)
  //     console.log('Form data submitted successfully:', formData);
  //     setFormData({
  //       usertype: null,
  //       requesttype: null,
  //       firstname: '',
  //       lastname: '',
  //       contact_email: '',
  //       country: null,
  //       description: '',
  //       document: null,
  //     });
  //   } catch (error) {
  //     console.error('Error submitting form data:', error);
  //     // Handle error (e.g., show error message)
  //   }
  // };


const handleSubmitCookiesData = async () => {
  console.log('Submitting form data:', formData);

  const data = new FormData();
  Object.keys(formData).forEach((key) => {
    if (formData[key] !== null && formData[key] !== undefined) {
      data.append(key, formData[key]);
    }
  });

  try {
    console.log('Submitting...');

    const response = await fetch(
      `${baseurl}/${initURL}/cookies-banner/cookies-req-data/${userId}`,
      {
        method: 'POST',
        body: data,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server responded with an error: ${errorText}`);
    }

    const result = await response.json();
    console.log('Form submitted successfully:', result);

    // Reset form data
    setFormData({
      usertype: null,
      requesttype: null,
      firstname: '',
      lastname: '',
      contact_email: '',
      country: null,
      description: '',
      document: null,
    });

    // Show success message
    alert('Form submitted successfully!');
  } catch (error) {
    // Check for network errors
    if (error.name === 'TypeError') {
      console.error('Network error occurred:', error);
      alert(
        'Network error. Please check your internet connection and try again.',
      );
    } else {
      // Handle server errors
      console.error('Error submitting form data:', error.message || error);
      alert(
        `Failed to submit the form. Error: ${error.message || 'Unknown error'}`,
      );
    }
  }
};


  const handleClick = () => {
    const iframe = document.getElementById(userId);
    iframe.style.height = '100vh';
    setShowModal(true);
    setCookiesAccepted(true);
  };

  return (
    <>
      <style jsx>
        {`
          ${CokkiesDetailCSS}
          ${ConsentCSS}
          
.cookie-declaration {
            table td {
              border: 1px solid #ccc;
              overflow: hidden !important;
              white-space: normal !important;
              text-overflow: ellipsis !important;
              font-size: 12px;
              color: black;
              padding: 1rem;
            }
            table th {
              font-size: 12px;
              text-align: center;
              color: black;
            }
            .table_desc {
              max-height: 4rem;
              overflow-y: auto;
              overflow-x: hidden;
            }
            .table_desc::-webkit-scrollbar {
              width: 2px;
            }
            .table_desc::-webkit-scrollbar-thumb {
              background-color: rgba(0, 0, 0, 0.3);
              border-radius: 4px;
            }
            .table_desc:empty {
              overflow: hidden;
            }
          }
        `}
        {`
          .button-group-center {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
          }

          button {
            min-width: 120px; /* Ensure all buttons have the same width */
            text-align: center;
          }

          .banner-horizontal {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100vw;
            padding: 20px;
            border-radius: 0;
            z-index: 2147483647;
            box-sizing: border-box;
            bottom: 0;
            padding: 20px;
            margin-top: 30px;
            border-radius: 5px;
          }

          .banner-center {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%; /* Adjust for responsiveness */
            max-width: 600px;
            padding: 20px; /* Padding for the banner */
            z-index: 2147483647; /* High z-index to ensure it's on top */
            background-color: white; /* Set background color */
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); /* Add a subtle shadow */
            border-radius: 8px; /* Rounded corners */
            margin: 0; /* Ensure no unwanted margins */
          }

          @media (max-width: 768px) {
            .banner-center {
              width: 90%; /* Adjust width for small screens */
              padding: 15px; /* Reduce padding */
            }
          }

          @keyframes fadeInLeft {
            from {
              opacity: 0;
              transform: translateX(-100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes fadeInRight {
            from {
              opacity: 0;
              transform: translateX(100%);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }

          @keyframes fadeInCenter {
            from {
              opacity: 0;
              transform: scale(0.8);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          .banner-left-bottom {
            position: fixed;
            bottom:;
            left: 20px;
            width: 400px; /* Fixed width */
            padding: 20px;
            // background-color: #fff; /* White background */
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Soft shadow */
            border-radius: 12px; /* Rounded corners */
            z-index: 9999; /* Ensure it stays on top */
            animation: fadeInLeft 0.5s ease-out; /* Optional: smooth animation */
          }
          .banner-right-bottom {
            position: fixed;
            bottom: 0;
            right: 0;
            width: 400px;
            margin-right: 20px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Soft shadow */
            margin-top: 20px;
            border-radius: 5px;
            animation: fadeInRight 0.5s ease-out;
          }

          .btn {
            display: inline-block;
            font-weight: 400;
            text-align: center;
            white-space: nowrap;
            vertical-align: middle;
            user-select: none;
            border: 1px solid transparent;
            padding: 0.375rem 0.75rem;
            font-size: 1rem;
            line-height: 1.5;
            border-radius: 0.25rem;
            transition:
              background-color 0.15s ease-in-out,
              border-color 0.15s ease-in-out,
              box-shadow 0.15s ease-in-out;
            cursor: pointer;
            animation: fadeInCenter 0.5s ease-out;
          }

          .btn:hover {
            text-decoration: none;
            opacity: 0.85;
          }
          .banner-horizontal-stacked {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            background-color: #f8f9fa; /* Light background color */
            padding: 20px;
            box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1); /* Subtle shadow */
            border-top: 1px solid #ddd;
            box-sizing: border-box;
            position: fixed;
            bottom: 0;
            left: 0;
            z-index: 1000;
          }

          /* Logo Section */
          .banner-logo {
            flex: 0 0 120px; /* Fixed width for the logo */
            height: 50px;
            background-color: #333;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            border-radius: 5px;
            text-transform: uppercase;
          }

          /* Center Content: Heading and Description */
          .banner-content {
            flex: 1;
            text-align: center;
            padding: 0 20px;
          }

          .banner-heading {
            margin: 0px;
            font-size: 1.5rem;
            font-weight: bold;
          }

          .banner-description {
            margin: 5px 0 0;
            font-size: 1rem;
            color: #555;
          }

          /* Buttons Section */
          .banner-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px; /* Vertical spacing between buttons */
          }

          .banner-buttons .button {
            padding: 10px 15px;
            font-size: 1rem;
            border: 1px solid #ccc;
            border-radius: 5px;
            background-color: #fff;
            color: #333;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
          }

          /* Responsive Styles */
          @media (max-width: 768px) {
            .banner-horizontal-stacked {
              flex-direction: column;
              padding: 15px;
            }

            .banner-buttons {
              flex-direction: row;
              margin-top: 10px;
              gap: 5px;
            }

            .banner-buttons .button {
              flex: 1;
            }

            .banner-logo {
              margin-bottom: 10px;
            }
          }
          .banner-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px; /* Vertical spacing between buttons */
          }

          .banner-buttons .button {
            padding: 10px 15px;
            font-size: 1rem;
            border: 1px solid #ccc;
            border-radius: 5px;
            background-color: #fff;
            color: #333;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
          }

          // /* Top Modal Overlay */
          // .banner-top-modal {
          //   position: fixed;
          //   top: 0;
          //   left: 0;
          //   right: 0;
          //   bottom: 0;
          //   width: 100%;
          //   height: 100vh; /* Full viewport height */
          //   background-color: rgba(0, 0, 0, 0.6); /* Semi-transparent overlay */
          //   z-index: 9998; /* Ensure it's above other content */
          //   display: flex;
          //   justify-content: center; /* Center horizontally */
          //   align-items: flex-start; /* Align content to the top */
          //   overflow: hidden; /* Prevent the entire page from scrolling */
          // }

          // /* Modal Content */
          // .modal-content {
          //   background-color: #ffffff;
          //   border-radius: 10px; /* Rounded corners */
          //   box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Subtle shadow */
          //   max-width: 600px; /* Restrict maximum width for larger screens */
          //   width: 90%; /* Responsive width */
          //   max-height: calc(
          //     100vh - 4rem
          //   ); /* Dynamic height: prevent overflow beyond viewport */
          //   overflow-y: auto; /* Enable scrolling if content exceeds max height */
          //   padding: 2rem; /* Inner padding for content */
          //   text-align: center; /* Center-align the text */
          //   z-index: 9999; /* Ensure it is above the overlay */
          // }

          // /* Buttons Container */
          // .buttons-container {
          //   display: flex;
          //   justify-content: center;
          //   gap: 10px; /* Spacing between buttons */
          // }

          // /* Buttons Styling */
          // .buttons-container .btn {
          //   padding: 10px 15px;
          //   border: 1px solid #168f7c; /* Default border */
          //   border-radius: 5px;
          //   font-size: 1rem;
          //   font-weight: bold;
          //   cursor: pointer;
          //   background-color: #ffffff; /* Default white background */
          //   color: #168f7c; /* Default teal text */
          //   transition: all 0.2s ease;
          // }

          // .buttons-container .btn:hover {
          //   background-color: #cccccc; /* Hover background */
          //   color: #000000; /* Hover text color */
          // }

          // /* Keyframe Animation */
          // @keyframes fadeInDown {
          //   from {
          //     opacity: 0;
          //     transform: translateY(-20px);
          //   }
          //   to {
          //     opacity: 1;
          //     transform: translateY(0);
          //   }
          // }
        `}
      </style>

      {!cookiesAccepted ? (
        <div
          className={`${
            parentkey.position === 'left-bottom'
              ? 'banner-left-bottom'
              : parentkey.position === 'right-bottom'
                ? 'banner-right-bottom'
                : parentkey.position === 'center'
                  ? 'banner-center'
                  : parentkey.position === 'horizontal-stacked'
                    ? 'banner-horizontal-stacked'
                    : parentkey.position === 'top-modal'
                      ? 'banner-top-modal'
                      : 'banner-horizontal'
          }`}
          style={{ backgroundColor: `${parentkey.backgroundColors}` }}
        >
          {parentkey.position === 'horizontal' ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
              }}
            >
              {/* Left Section: Header and Description */}
              <div style={{ flex: 1, paddingRight: '20px' }}>
                <h3
                  style={{
                    color: parentkey.headingColor,
                    fontFamily: 'Inter, sans-serif',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: parentkey?.heading,
                  }}
                />
                <p
                  style={{
                    color: parentkey.descriptionColor,
                    fontFamily: 'Inter, sans-serif',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: parentkey?.description,
                  }}
                />
              </div>

              {/* Right Section: Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.acceptButtonBgColor}` || '#28a745',
                    color: `${parentkey.acceptTextColor}` || '#fff',
                    borderColor: `${parentkey.acceptBorderColor}` || '#28a745',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.375rem 0.75rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.acceptHoverBgColor}` || '#218838';
                    e.currentTarget.style.color =
                      `${parentkey.acceptHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.acceptButtonBgColor}` || '#28a745';
                    e.currentTarget.style.color =
                      `${parentkey.acceptTextColor}` || '#fff';
                  }}
                  onClick={handleAcceptCookies}
                >
                  Accept all
                </button>
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.rejectButtonBgColor}` || '#dc3545',
                    color: `${parentkey.rejectTextColor}` || '#fff',
                    borderColor: `${parentkey.rejectBorderColor}` || '#dc3545',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.375rem 0.75rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.rejectHoverBgColor}` || '#c82333';
                    e.currentTarget.style.color =
                      `${parentkey.rejectHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.rejectButtonBgColor}` || '#dc3545';
                    e.currentTarget.style.color =
                      `${parentkey.rejectTextColor}` || '#fff';
                  }}
                  onClick={handleRejectCookies}
                >
                  Reject all
                </button>
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.customizeButtonBgColor}` || '#007bff',
                    color: `${parentkey.customizeTextColor}` || '#fff',
                    borderColor:
                      `${parentkey.customizeBorderColor}` || '#007bff',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.375rem 0.75rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.customizeHoverBgColor}` || '#0069d9';
                    e.currentTarget.style.color =
                      `${parentkey.customizeHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.customizeButtonBgColor}` || '#007bff';
                    e.currentTarget.style.color =
                      `${parentkey.customizeTextColor}` || '#fff';
                  }}
                  onClick={handleCustomize}
                >
                  Customize
                </button>
              </div>
            </div>
          ) : parentkey.position === 'center' ? (
            <div style={{ textAlign: 'center' }}>
              <h3
                style={{
                  color: parentkey.headingColor,
                  fontFamily: 'Inter, sans-serif',
                }}
                dangerouslySetInnerHTML={{
                  __html: parentkey?.heading,
                }}
              />
              <p
                style={{
                  color: parentkey.descriptionColor,
                  fontFamily: 'Inter, sans-serif',
                }}
                dangerouslySetInnerHTML={{
                  __html: parentkey?.description,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '15px',
                }}
              >
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.acceptButtonBgColor}` || '#28a745',
                    color: `${parentkey.acceptTextColor}` || '#fff',
                    borderColor: `${parentkey.acceptBorderColor}` || '#28a745',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.5rem 1rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.acceptHoverBgColor}` || '#218838';
                    e.currentTarget.style.color =
                      `${parentkey.acceptHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.acceptButtonBgColor}` || '#28a745';
                    e.currentTarget.style.color =
                      `${parentkey.acceptTextColor}` || '#fff';
                  }}
                  onClick={handleAcceptCookies}
                >
                  Accept
                </button>
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.rejectButtonBgColor}` || '#dc3545',
                    color: `${parentkey.rejectTextColor}` || '#fff',
                    borderColor: `${parentkey.rejectBorderColor}` || '#dc3545',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.5rem 1rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.rejectHoverBgColor}` || '#c82333';
                    e.currentTarget.style.color =
                      `${parentkey.rejectHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.rejectButtonBgColor}` || '#dc3545';
                    e.currentTarget.style.color =
                      `${parentkey.rejectTextColor}` || '#fff';
                  }}
                  onClick={handleRejectCookies}
                >
                  Reject
                </button>
                <button
                  className="btn"
                  style={{
                    backgroundColor:
                      `${parentkey.customizeButtonBgColor}` || '#007bff',
                    color: `${parentkey.customizeTextColor}` || '#fff',
                    borderColor:
                      `${parentkey.customizeBorderColor}` || '#007bff',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    padding: '0.5rem 1rem',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.customizeHoverBgColor}` || '#0069d9';
                    e.currentTarget.style.color =
                      `${parentkey.customizeHoverTextColor}` || '#fff';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      `${parentkey.customizeButtonBgColor}` || '#007bff';
                    e.currentTarget.style.color =
                      `${parentkey.customizeTextColor}` || '#fff';
                  }}
                  onClick={handleCustomize}
                >
                  Customize
                </button>
              </div>
            </div>
          ) : parentkey.position === 'horizontal-stacked' ? (
            <div className="banner-horizontal-stacked">
              {/* Logo Section */}
              <div className="banner-logo">LOGO</div>

              {/* Center Heading and Description */}
              <div className="banner-content">
                <h3
                  className="banner-heading"
                  style={{ color: parentkey?.headingColor }}
                >
                  {parentkey?.heading}
                </h3>
                <p
                  className="banner-description"
                  style={{ color: parentkey?.descriptionColor }}
                >
                  {parentkey?.description}
                </p>
              </div>

              {/* Buttons Section */}
              <div className="banner-buttons">
                <button className="button accept" onClick={handleAcceptCookies}>
                  Accept All
                </button>
                <button className="button reject" onClick={handleRejectCookies}>
                  Reject All
                </button>
                <button className="button customize" onClick={handleCustomize}>
                  Customize
                </button>
              </div>
            </div>
          ) : (
            //parentkey.position === 'top-modal' ? (
            //   <div className="modal-content">
            //     {/* Heading */}
            //     <h3 style={{ color: parentkey.headingColor || '#333' }}>
            //       {parentkey.heading || 'Consent Banner'}
            //     </h3>

            //     {/* Description */}
            //     <p style={{ color: parentkey.descriptionColor || '#555' }}>
            //       {parentkey.description ||
            //         'We respect your privacy and aim for the best website experience.'}
            //     </p>

            //     {/* Buttons */}
            //     <div className="buttons-container">
            //       <button
            //         className="btn"
            //         style={{
            //           backgroundColor: parentkey.acceptButtonBgColor || '#ffffff',
            //           color: parentkey.acceptTextColor || '#168f7c',
            //           borderColor: parentkey.acceptBorderColor || '#168f7c',
            //         }}
            //         onClick={handleAcceptCookies}
            //       >
            //         Accept
            //       </button>

            //       <button
            //         className="btn"
            //         style={{
            //           backgroundColor: parentkey.rejectButtonBgColor || '#ffffff',
            //           color: parentkey.rejectTextColor || '#168f7c',
            //           borderColor: parentkey.rejectBorderColor || '#168f7c',
            //         }}
            //         onClick={handleRejectCookies}
            //       >
            //         Reject
            //       </button>

            //       <button
            //         className="btn"
            //         style={{
            //           backgroundColor:
            //             parentkey.customizeButtonBgColor || '#168f7c',
            //           color: parentkey.customizeTextColor || '#ffffff',
            //           borderColor: parentkey.customizeBorderColor || '#168f7c',
            //         }}
            //         onClick={handleCustomize}
            //       >
            //         Customize
            //       </button>
            //     </div>
            //   </div>
            // )
            <>
              <h3
                className="banner-heading"
                style={{
                  color: parentkey.headingColor,
                  fontFamily: 'Inter, sans-serif',
                }}
                dangerouslySetInnerHTML={{
                  __html: parentkey?.heading,
                }}
              />
              <p
                className=""
                style={{
                  color: parentkey.descriptionColor,
                  fontFamily: 'Inter, sans-serif',
                }}
                dangerouslySetInnerHTML={{
                  __html: parentkey?.description,
                }}
              />
              <button
                className="btn"
                style={{
                  backgroundColor:
                    `${parentkey.acceptButtonBgColor}` || '#28a745',
                  color: `${parentkey.acceptTextColor}` || '#fff',
                  borderColor: `${parentkey.acceptBorderColor}` || '#28a745',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  margin: '5px',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.acceptHoverBgColor}` || '#218838';
                  e.currentTarget.style.color =
                    `${parentkey.acceptHoverTextColor}` || '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.acceptButtonBgColor}` || '#28a745';
                  e.currentTarget.style.color =
                    `${parentkey.acceptTextColor}` || '#fff';
                }}
                onClick={handleAcceptCookies}
              >
                Accept all
              </button>
              <button
                className="btn"
                style={{
                  backgroundColor:
                    `${parentkey.rejectButtonBgColor}` || '#dc3545',
                  color: `${parentkey.rejectTextColor}` || '#fff',
                  borderColor: `${parentkey.rejectBorderColor}` || '#dc3545',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  margin: '5px',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.rejectHoverBgColor}` || '#c82333';
                  e.currentTarget.style.color =
                    `${parentkey.rejectHoverTextColor}` || '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.rejectButtonBgColor}` || '#dc3545';
                  e.currentTarget.style.color =
                    `${parentkey.rejectTextColor}` || '#fff';
                }}
                onClick={handleRejectCookies}
              >
                Reject all
              </button>
              <button
                className="btn"
                style={{
                  backgroundColor:
                    `${parentkey.customizeButtonBgColor}` || '#007bff',
                  color: `${parentkey.customizeTextColor}` || '#fff',
                  borderColor: `${parentkey.customizeBorderColor}` || '#007bff',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  padding: '0.375rem 0.75rem',
                  margin: '0.25rem',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.customizeHoverBgColor}` || '#0069d9';
                  e.currentTarget.style.color =
                    `${parentkey.customizeHoverTextColor}` || '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor =
                    `${parentkey.customizeButtonBgColor}` || '#007bff';
                  e.currentTarget.style.color =
                    `${parentkey.customizeTextColor}` || '#fff';
                }}
                onClick={handleCustomize}
              >
                Customize
              </button>
            </>
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'white',
            borderColor: '#007bff',
            height: '50px',
            width: '50px',
            position: 'fixed',
            left: '3%',
            bottom: '3%',
            borderRadius: '0.25rem',
            margin: '0.25rem',
            transition: 'background-color 0.3s, color 0.3s',
            backgroundImage:
              "url('https://logowik.com/content/uploads/images/cookie8108.logowik.com.webp')",
            backgroundRepeat: 'no-repeat',
            backgroundSize: '100%',
            backgroundPosition: 'center',
            objectFit: 'fill',
          }}
          onClick={handleClick}
          className="cookies-svg"
        ></div>
      )}

      <div className={`modal ${showModal ? 'show' : ''}`}>
        <div className="modal-overlay" onClick={handleCloseModal}></div>
        <div className="modal-content">
          <header className="modal-header">
            <h1 className="modal-title">Cookie Settings</h1>
            <button className="close-button" onClick={handleCloseModal}>
              &times;
            </button>
          </header>
          <div className="modal-body">
            <ul className="tab-navigation">
              <li
                className={`tab-item ${activeTab === 'home' ? 'active' : ''}`}
                onClick={() => handleTabClick('home')}
              >
                Settings
              </li>
              <li
                className={`tab-item ${
                  activeTab === 'profile' ? 'active' : ''
                }`}
                onClick={() => handleTabClick('profile')}
              >
                Privacy Policy
              </li>
              <li
                className={`tab-item ${
                  activeTab === 'contact' ? 'active' : ''
                }`}
                onClick={() => handleTabClick('contact')}
              >
                Cookie Declaration
              </li>
              <li
                className={`tab-item ${activeTab === 'data' ? 'active' : ''}`}
                onClick={() => handleTabClick('data')}
              >
                Data Request
              </li>
            </ul>
            <div className="tab-content">
              {activeTab === 'home' && (
                <div className="tab-panel">
                  <PrivacySetting
                    setToggle={setToggle}
                    toggle={toggle}
                    categoryChecked={categoryChecked}
                    toggleSwitch={toggleSwitch}
                    setCategoryChecked={setCategoryChecked}
                  />
                </div>
              )}
              {activeTab === 'profile' && (
                <div
                  className="tab-panel scrollable"
                  dangerouslySetInnerHTML={{
                    __html:
                      consentdata?.privacyPolicyData?.privacyPolicyDataCustom,
                  }}
                />
              )}
              {activeTab === 'contact' && (
                <div
                  className="tab-panel scrollable"
                  dangerouslySetInnerHTML={{
                    __html:
                      consentdata?.cookiesPolicyData?.cookiesPolicyDataCustom,
                  }}
                />
              )}
              {activeTab === 'data' && (
                <div className="tab-panel scrollable">
                  <CookiesForm
                    formData={formData}
                    setFormData={setFormData}
                    handleSubmitCookiesData={handleSubmitCookiesData}
                    setValidationErrors={setValidationErrors}
                    setValidationFn={setValidationFn}
                  />
                </div>
              )}
            </div>
          </div>
          {/* <footer className="modal-footer">
            <button className="btn-decline" onClick={handleCloseModal}>
              Decline
            </button>
            {activeTab === 'data' ? (
              <button className="btn-primary" onClick={handleSubmitCookiesData}>
                Submit
              </button>
              {Object.keys(validationErrors).length > 0 && (
                <ul>
                  {Object.entries(validationErrors).map(([key, error]) => (
                    <li key={key}>{error}</li>
                  ))}
                </ul>
              )}

            ) : (
              <button className="btn-primary" onClick={handleAcceptCookiesData}>
                Accept
              </button>
            )}
          </footer> */}
          <footer className="modal-footer">
            <button className="btn-decline" onClick={handleCloseModal}>
              Decline
            </button>
            {activeTab === 'data' ? (
              <>
                <button
                  className="btn-primary"
                  onClick={handleSubmitCookiesData}
                >
                  Submit
                </button>
                {Object.keys(validationErrors).length > 0 && (
                  <ul>
                    {Object.entries(validationErrors).map(([key, error]) => (
                      <li key={key}>{error}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <button className="btn-primary" onClick={handleAcceptCookiesData}>
                Accept
              </button>
            )}
          </footer>
        </div>
        <style jsx>{`
          .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            background: rgba(0, 0, 0, 0.5);
            opacity: 0;
            visibility: hidden;
            transition:
              opacity 0.3s ease,
              visibility 0.3s ease;
          }
          .modal.show {
            opacity: 1;
            visibility: visible;
          }
          .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
          }
          .modal-content {
            position: relative;
            background: #fff;
            border-radius: 8px;
            max-width: 900px; /* Increased the max-width */
            width: 95%; /* Ensure it looks good on smaller screens */
            height: 80%;
            display: flex;
            flex-direction: column;
          }
          .modal-header {
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e5e5e5;
          }
          .modal-title {
            font-size: 18px;
            font-weight: bold;
            margin: 0;
          }
          .close-button {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
          }
          .modal-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .tab-navigation {
            display: flex;
            justify-content: space-between;
            margin: 0;
            padding: 0;
            list-style: none;
            border: 1px solid #ccc;
            border-radius: 8px;
            overflow: hidden;
          }
          .tab-item {
            flex: 1;
            padding: 10px 15px;
            text-align: center;
            cursor: pointer;
            font-weight: bold;
            background: #f9f9f9;
            transition:
              background-color 0.3s ease,
              color 0.3s ease;
            border-right: 1px solid #ccc;
          }
          .tab-item:last-child {
            border-right: none;
          }
          .tab-item.active {
            background: #000;
            color: #fff;
            font-weight: bold;
          }
          .tab-item:hover {
            background: #e3e3e3;
          }
          .tab-content {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
            background: #f9f9f9;
            border-radius: 8px;
          }
          .modal-footer {
            padding: 15px;
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #e5e5e5;
          }
          .btn-primary {
            background: #00bcd4;
            color: #fff;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .btn-primary:hover {
            background: #008c9e;
          }
          .btn-decline {
            background: #ccc;
            color: #333;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          .btn-decline:hover {
            background: #bbb;
          }
        `}</style>
      </div>
    </>
  );
};

export default Consent;
