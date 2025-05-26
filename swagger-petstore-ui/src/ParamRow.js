import React from 'react';
import { generateExample } from './utils';

function ParamRow({ param }) {
  // Generate the default value for the textarea
  const defaultValue = param.in === 'body' && param.schema
    ? JSON.stringify(generateExample(param.schema), null, 2)
    : '';

  return (
    <div className="param-row">
      <label>{`[${param.in}] ${param.name}${param.required ? ' *' : ''}`}</label>
      {param.in === 'body' && param.schema ? (
        <textarea
          rows="6"
          defaultValue={defaultValue}
        ></textarea>
      ) : param.in === 'formData' ? (
        param.type === 'file' ? (
          <input type="file" />
        ) : (
          <input type="text" />
        )
      ) : (
        <input type="text" />
      )}
    </div>
  );
}

export default ParamRow;