import get from 'lodash.get';
import { parse } from 'regexparam';
import Ajv, { Format } from 'ajv';
import addFormats from 'ajv-formats';

export interface Options {
  callNext?: boolean;
  customFormats?: {
    [key: string]: Format;
  };
}

export interface Spec {
  paths: {
    [key: string]: any;
  };
  components: {
    schema: any;
  };
}

export enum SupportedContentTypes {
  Json = 'application/json',
}

export enum SupportedParameterTypes {
  Path = 'path',
  Query = 'query',
}

interface Properties {
  type: string;
  format?: string;
  items?: Properties;
}

interface JsonSchema {
  type?: string;
  properties?: Map<string, Properties>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
}

interface Parameter {
  in: string;
  name: string;
  schema: JsonSchema;
  required: boolean;
}

interface ApplicationJson {
  schema: JsonSchema;
}

interface Content {
  'application/json': ApplicationJson;
}

interface RequestBody {
  description?: string;
  content: Content;
  required?: boolean;
}

function resolveSchema(spec: any, schema?: JsonSchema) {
  if (!schema) return undefined;

  if (schema.$ref) {
    const resolvedRef = schema.$ref.replace('#/', '').replace(/\//g, '.');

    return get(spec, resolvedRef);
  }
  return schema;
}

function resolveParams(compiled: any, path?: string) {
  let i = 0;
  const out: any = {};
  if (!path) return out;
  const matches = compiled.pattern.exec(path.replace(/\?.*$/g, ''));
  while (i < compiled.keys.length) {
    out[compiled.keys[i]] = matches[++i] || null;
  }
  return out;
}

function resolveParameters(
  parameters: Parameter[],
  type: SupportedParameterTypes,
  spec: Spec,
) {
  if (parameters.length === 0) return undefined;

  const resolved = parameters
    .filter((it) => it.in === type)
    .reduce(
      (a: any, it) => {
        a.properties[it.name] = resolveSchema(spec, it.schema);
        if (it.required) {
          a.required.push(it.name);
        }
        return a;
      },
      {
        type: 'object',
        properties: {},
        required: [],
      },
    );

  return Object.keys(resolved.properties).length ? resolved : undefined;
}

export const openApiValidation = (spec: any, options?: Options) => {
  if (!spec) {
    throw new Error('Invalid spec');
  }

  // Build paths once
  const buildPaths = Object.entries(spec.paths || {}).reduce(
    (a: any, [path, def]) => {
      const pathingString = path.replace(/{.+?}/g, (v) => `:${v.slice(1, -1)}`);
      a[pathingString] = def;
      return a;
    },
    {},
  );

  return (req: any, res: any, next: Function) => {
    const keys = Object.keys(buildPaths);
    for (const path of keys) {
      const compiled = parse(path);

      // Do we match the incoming path?
      if (compiled.pattern.test(req.path)) {
        // Do we have a definition for the method type?
        const methodDef = buildPaths[path][req.method?.toLowerCase()];
        if (!methodDef) break;

        // For now just grab parameters and requestBody
        const {
          parameters = [],
          requestBody,
        }: {
          parameters?: Parameter[];
          requestBody?: RequestBody;
        } = methodDef;

        const paramSchema = resolveParameters(
          parameters,
          SupportedParameterTypes.Path,
          spec,
        );
        const querySchema = resolveParameters(
          parameters,
          SupportedParameterTypes.Query,
          spec,
        );
        const bodySchema = resolveSchema(
          spec,
          requestBody?.content?.[SupportedContentTypes.Json]?.schema,
        );

        const properties: any = {};
        const required = [];
        if (bodySchema) {
          properties.body = bodySchema;
          required.push('body');
        }
        if (paramSchema) {
          properties.params = paramSchema;
          required.push('params');
        }
        if (querySchema) {
          properties.query = querySchema;
          required.push('query');
        }

        req.params = resolveParams(compiled, req.url);

        const ajv = new Ajv();
        addFormats(ajv);
        if (options?.customFormats) {
          Object.entries(options.customFormats).forEach(([k, v]) => {
            ajv.addFormat(k, v);
          });
        }

        const validate = ajv.compile({
          type: 'object',
          properties,
          required,
        });
        const valid = validate(req);
        if (!valid) {
          const [error] = validate.errors || [];
          const errorMessage = [
            error.instancePath?.slice(1).replace(/\//g, '.'),
            error.message,
          ]
            .filter(Boolean)
            .join(' ');
          if (options?.callNext) {
            return next(new Error(errorMessage));
          }
          return res.status(400).json({
            message: errorMessage,
          });
        }
      }
    }
    next();
  };
};
