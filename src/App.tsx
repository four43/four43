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

export class App extends React.Component<{}, {}> {

	constructor(props: {}) {
		super(props);
		console.log(`
 ___                 _  _  ____  
/  _|               | || ||___ \\
| |_ ___  _   _ _ __| || |_ __) |
|  _/ _ \\| | | | '__|__   _|__ <
| || (_) | |_| | |     | | ___) |
|_| \\___/ \\__,_|_|     |_||____/

The professional home of Seth Miller. Please take a look around.

This website was created using Typescript and React, a bit much for a simple page, but it's fun, and that's what
personal sites are for.
The full source is available at: https://github.com/four43/four43/tree/gh-pages

Like what you see? Contact me: seth@four43.com
`);
	}

	render() {
		return (
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
	}
}