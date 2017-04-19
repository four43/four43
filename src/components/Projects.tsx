import * as React from 'react';

export const Projects = () => (
	<section id="projects" className="container-fluid">
		<div className="section-header row">
			<div className="content-container col-sm-6 col-sm-offset-3">
				<h2>Projects</h2>
				<h3>Open-Source development</h3>
			</div>
		</div>
		<ul>
			<li className="row">
				<div className="content-container col-sm-6 col-sm-offset-3">
					<h3>Crisp Cache -&nbsp;
						<a className="lead"
						   href="https://github.com/four43/admiral-cli">github.com/four43/crisp-cache</a>
					</h3>
					<p>
						An always up to date cache for high throughput applications. Crisp Cache adds "stale" to the
						lifecycle of a cache element. Stale entries are used from the cache while Crisp Cache fetches
						new cache entries in the background. Responsive applications need reliable consistent streams
						of data, and Crisp Cache fills the void over other caches that may block when an entry is
						expired
						or goes past it's TTL.
					</p>
				</div>
			</li>
			<li className="row">
				<div className="content-container col-sm-6 col-sm-offset-3">
					<h3>Admiral CLI -&nbsp;
						<a className="lead"
						   href="https://github.com/four43/admiral-cli">github.com/four43/admiral-cli</a>
					</h3>
					<p>
						Admiral-CLI is a Command Line Framework (CLI) framework for Node.js. There are other CLI
						frameworks available for Node.js already, however Admiral adds validation and some callbacks
						in key places to make apps easier to write. We wanted to create a framework with less
						configuration but stronger validation.
						<br/>
						<br/>
						Configuration should be easy to understand while CLI parameters are strictly validated
						and appropriate error messages are passed on to the user. A CLI is a user interface,
						let's treat it like one.
					</p>
				</div>
			</li>
			<li className="row">
				<div className="content-container col-sm-6 col-sm-offset-3">
					<h3>Cite API -&nbsp;
						<a className="lead" href="https://github.com/four43/cite-api">github.com/four43/cite-api</a>
					</h3>
					<p>
						Documentation is always difficult to create and keep up to date. Cite API aims to step in and
						ease the creation for RESTful APIs. It looks at JSON Schema, the same schema that is tested as
						correct API input/output and generates beautiful docs based on that. Much like Swagger, but with
						less configuration, as the configuration is already the tested schema. This project is in the
						very early stages of development but the need is high for better documentation tools.
					</p>
				</div>
			</li>
			<li className="row">
				<div className="content-container col-sm-6 col-sm-offset-3">
					<h3>SleepyTable -&nbsp;
						<a className="lead" href="https://github.com/hamweather/sleepytable">github.com/hamweather/sleepytable</a>
					</h3>
					<p>
						SleepyTable is an open source project sponsored by AerisWeather. It was designed to ingest web
						API's
						and allow for paging, filtering, and sorting server side. It is open source and is looking for
						more developers for the project. It was originally developed as a
						jQuery plugin and is a little dated now, but is still used in production. I would like to update
						it with a more modern framework like Bootstrap possibly React or Angular.
					</p>
				</div>
			</li>
		</ul>
	</section>
);