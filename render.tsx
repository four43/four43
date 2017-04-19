import * as React from 'react';
import {renderToString} from 'react-dom/server';
import { App } from './src/App';
import * as fs from 'fs';

const reactHtml = renderToString(<App />);

const indexTemplate = fs.readFileSync('./src/index.template.html', 'utf8') as string;
fs.writeFileSync('./index.html', indexTemplate.replace('${reactRoot}', reactHtml));


