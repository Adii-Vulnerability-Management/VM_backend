// export const DefaultData = {
//     "user_uuid": "",
//     "consentBannerData": {
//         "heading": "",
//         "description": "",
//         "backgroundColors": "#FFFFF5",
//         "backgroundColorsAccept": "#5AE31B",
//         "ColorsAccept": "#FFFFFF",
//         "backgroundColorsReject": "#FC2803",
//         "ColorsReject": "#FFFFFF"
//     },
//     "privacyPolicyData": {
//         "privacyPolicyDataCustom": ""
//     },
//     "cookiesPolicyData": {
//         "cookiesPolicyDataCustom": ""
//     },
//     "privacySettingData": {
//         "cookiesData": [
//             {
//                 "cookie_name": "_lfa",
//                 "cookie_id": "_lfa",
//                 "url": ".einnosec.com",
//                 "duration": "1 year",
//                 "storage_type": "cookie",
//                 "description": "This cookie is set by the provider Leadfeeder to identify the IP address of devices visiting the website, in order to retarget multiple users routing from the same IP address.",
//                 "category": "Necessary",
//                 "category_desc": "Necessary cookies are absolutely essential for the website to function properly. These cookies ensure basic functionalities and security features of the website, anonymously."
//             }
//         ]
//     }
// }

export const DefaultData = {
    "user_uuid": "",
    "consentBannerData": {
        "backgroundColors": "#168F7C",
        "headingColor":  '#FFFFFF',
        "textColor":  '#FFFFFF',
        "acceptButtonBgColor":  '#FFFFFF',
        "acceptTextColor":  '#168F7C',
        "acceptHoverBgColor": '#CCCCCC', // New field for accept button hover background color
        "acceptHoverTextColor":  '#000000', // New field for accept button hover text color
        "rejectButtonBgColor":  '#FFFFFF',
        "rejectTextColor":  '#168F7C',
        "rejectHoverBgColor":  '#CCCCCC', // New field for reject button hover background color
        "rejectHoverTextColor": '#000000', // New field for reject button hover text color
        "customizeButtonBgColor":  '#FFFFFF',
        "customizeTextColor":  '#168F7C',
        "customizeHoverBgColor":  '#CCCCCC', // New field for customize button hover background color
        "customizeHoverTextColor":  '#000000', // New field for customize button hover text color
        "heading": 'Default Heading',
        "description": 'Default Description',
        "descriptionColor": '#FFFFFF',
        "position": 'horizontal'
    },
    "privacyPolicyData": {
        "privacyPolicyDataCustom": ""
    },
    "cookiesPolicyData": {
        "cookiesPolicyDataCustom": ""
    },
    "privacySettingData": {
        "cookiesData": [
            {
                "cookie_name": "_lfa",
                "cookie_id": "_lfa",
                "url": ".einnosec.com",
                "duration": "1 year",
                "storage_type": "cookie",
                "description": "This cookie is set by the provider Leadfeeder to identify the IP address of devices visiting the website, in order to retarget multiple users routing from the same IP address.",
                "category": "Necessary",
                "category_desc": "Necessary cookies are absolutely essential for the website to function properly. These cookies ensure basic functionalities and security features of the website, anonymously."
            }
        ]
    }
}
