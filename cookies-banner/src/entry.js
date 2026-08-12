import React from 'react';
import ReactDOM from 'react-dom';
import Component from './Component';

// wait until the page is ready
function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else fn();
}

onReady(() => {
  // 1) create mount node
  const mount = document.createElement('div');
  mount.id = 'grc-react-banner';
  document.body.appendChild(mount);

  // 2) render your component
  ReactDOM.render(
    React.createElement(Component),
    mount
  );
});
