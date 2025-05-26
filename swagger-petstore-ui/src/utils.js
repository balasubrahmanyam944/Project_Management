export function generateExample(schema, definitions = {}, visited = new Set()) {
    if (!schema) return {};
  
    if (schema.$ref) {
      const refName = schema.$ref.replace('#/definitions/', '');
      if (visited.has(refName)) {
        return {};
      }
      visited.add(refName);
      const defSchema = definitions[refName];
      if (!defSchema) return {};
      return generateExample(defSchema, definitions, visited);
    }
  
    switch (schema.type) {
      case 'object': {
        const result = {};
        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            result[propName] = generateExample(propSchema, definitions, visited);
          }
        }
        return result;
      }
      case 'array': {
        if (!schema.items) return [];
        const item = generateExample(schema.items, definitions, visited);
        return [item];
      }
      case 'string': {
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        if (schema.default !== undefined) {
          return schema.default;
        }
        return "string";
      }
      case 'integer':
      case 'number': {
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        if (schema.default !== undefined) {
          return schema.default;
        }
        return 0;
      }
      case 'boolean': {
        if (schema.default !== undefined) {
          return schema.default;
        }
        return false;
      }
      default:
        return {};
    }
  }