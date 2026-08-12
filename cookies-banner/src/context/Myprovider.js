


import React, { createContext, useState, useEffect } from "react";
import { DefaultData } from "../DefaultData";
const MyContext = createContext();

function Myprovider({ children }) {
  console.log(DefaultData);
  const [selectedLanguage, setSelectedLanguage] = useState('es');

  const [consentdata, setConsentData] = useState({
    user_uuid: DefaultData.user_uuid,
    consentBannerData: {
      // heading: DefaultData?.consentBannerData?.heading,
      // description: DefaultData?.consentBannerData?.description,
      // backgroundColors: DefaultData?.consentBannerData?.backgroundColors,
      // backgroundColorsAccept: DefaultData?.consentBannerData?.backgroundColorsAccept,
      // ColorsAccept: DefaultData?.consentBannerData?.ColorsAccept,
      // backgroundColorsReject: DefaultData?.consentBannerData?.backgroundColorsReject,
      // ColorsReject: DefaultData?.consentBannerData?.ColorsReject,

      backgroundColors:DefaultData?.consentBannerData?.backgroundColors,
      headingColor: DefaultData?.consentBannerData?.headingColor,
      textColor: DefaultData?.consentBannerData?.textColor,
      acceptButtonBgColor: DefaultData?.consentBannerData?.acceptButtonBgColor,
      acceptTextColor:DefaultData?.consentBannerData?.acceptTextColor,
      acceptHoverBgColor: DefaultData?.consentBannerData?.acceptHoverBgColor, // New field for accept button hover background color
      acceptHoverTextColor: DefaultData?.consentBannerData?.acceptHoverTextColor, // New field for accept button hover text color
      rejectButtonBgColor:  DefaultData?.consentBannerData?.rejectButtonBgColor,
      rejectTextColor:  DefaultData?.consentBannerData?.rejectTextColor,
      rejectHoverBgColor:  DefaultData?.consentBannerData?.rejectHoverBgColor, // New field for reject button hover background color
      rejectHoverTextColor:  DefaultData?.consentBannerData?.rejectHoverTextColor, // New field for reject button hover text color
      customizeButtonBgColor:  DefaultData?.consentBannerData?.customizeButtonBgColor,
      customizeTextColor:  DefaultData?.consentBannerData?.customizeTextColor,
      customizeHoverBgColor:  DefaultData?.consentBannerData?.customizeHoverBgColor, // New field for customize button hover background color
      customizeHoverTextColor:  DefaultData?.consentBannerData?.customizeHoverTextColor, // New field for customize button hover text color
      heading: DefaultData?.consentBannerData?.heading,
      description:  DefaultData?.consentBannerData?.description,
      descriptionColor:  DefaultData?.consentBannerData?.descriptionColor,
      position:  DefaultData?.consentBannerData?.position
    },
    privacyPolicyData: {
      privacyPolicyDataCustom: DefaultData?.privacyPolicyData?.privacyPolicyDataCustom,
    },
    cookiesPolicyData: {
      cookiesPolicyDataCustom: DefaultData?.cookiesPolicyData?.cookiesPolicyDataCustom,
    },
    privacySettingData: {
      cookiesData: DefaultData?.privacySettingData?.cookiesData,
    },
  });

  return (
    <MyContext.Provider
      value={{
        consentdata,
        setConsentData,
        selectedLanguage,
        setSelectedLanguage
      }}
    >
      {children}
    </MyContext.Provider>
  );
}

export { Myprovider, MyContext };

