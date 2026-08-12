// src/CookieBanner.jsx
import React from 'react';

export default function CookieBanner({ payload, userId }) {
  return (
    <div
      id="cookie-banner-root"
      style={{
        position: 'fixed',
        bottom: 0,
        width: '100%',
        background: '#222',
        color: '#fff',
        padding: '1em',
        textAlign: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <strong>CookieBanner</strong><br/>
      {/* show that userId is flowing through */}
      {userId ? `Hello, ${userId}` : 'Hello, guest'}
    </div>
  );
}
