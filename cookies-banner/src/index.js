import React from 'react';
import ReactDOM from 'react-dom';
import MyComponent from './privacy/MyComponent';
import { Myprovider } from './context/Myprovider';
import './style.css';
import { DefaultData } from './DefaultData';

// export const baseurl = 'https://e-grc.einnosec.com'
// export const initURL = "apiv2"
// export const baseurl = 'http://34.235.207.221';
export const baseurl = 'http://23.22.92.199';
// export const initURL = 'apiv2user8';
export const initURL = 'dev1';

document.addEventListener('DOMContentLoaded', function () {
  console.log('this one called');
  
  const iframe_container = document.createElement('div');
  document.body.appendChild(iframe_container);
  iframe_container.style.width = '100%';
  // iframe_container.style.position = "absolute";
  iframe_container.style.position = 'fixed';
  iframe_container.style.zIndex = 999;
  iframe_container.style.bottom = 0;

  // Create a new container element
  const container = document.createElement('div');

  const userId = DefaultData.user_uuid;

  // Create an iframe element
  const iframe = document.createElement('iframe');
  iframe.id = userId;
  iframe_container.appendChild(iframe);
  iframe.style.width = '100%';
  // iframe.style.maxHeight = "24rem";
  iframe.style.height = '15rem';
  // Append the container into the iframe body
  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.body.appendChild(container);

  // Render React components into the container
  ReactDOM.render(
    <React.StrictMode>
      <Myprovider>
        <MyComponent />
      </Myprovider>
    </React.StrictMode>,
    container,
  );
});
