
import React from 'react'
import Consent from './Consent'

function MyComponent(props) {
  console.log(props, "props,MyComponent");
  return (
    <div>
      <Consent props={props} />
    </div>
  )
}

export default MyComponent
