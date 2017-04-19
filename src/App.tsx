import * as React from 'react';


import {About} from './components/About';
import {Contact} from './components/Contact';
import {Highlights} from './components/Highlights';
import {Nav} from './components/Nav';
import {Projects} from './components/Projects';
import {Title} from './components/Title';
import {Updates} from './components/Updates';
import {Values} from './components/Values';
import {Work} from './components/Work';

export const App = () => (
	<div>
		<header>
			<Nav />
			<Title />
		</header>
		<About now={new Date()}/>
		<Highlights />
		<Work />
		<Projects />
		<Values />
		<Contact />
	</div>
);