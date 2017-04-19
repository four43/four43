import * as React from 'react';

export const Highlights = () => (
	<section id="highlights" className="container-fluid">
		<div className="row">
			<div className="col-sm-4 tech-highlight">
				<span className="feature-icon">
					<i className="fa fa-cloud icon"></i>
				</span>
				<div className="tech-container">
					<h3>Web</h3>
					<p>
						Experience in connecting users with content they need. Seth has created web APIs, for
						consumption by other systems and mobile devices. An API centric model is essential for a growing
						flexible business. Those APIs power user interfaces Seth has created. These complex web apps,
						using the latest front end technologies, make for fast and responsive user experiences.
					</p>
				</div>
			</div>
			<div className="col-sm-4 tech-highlight">
				<span className="feature-icon">
					<i className="fa fa-database icon"></i>
				</span>
				<div className="tech-container">
					<h3>Big Data</h3>
					<p>
						With a background in traditional relational databases and experience in the more
						loose No-SQL data stores, Seth has worked with a broad range of storage systems for
						a wide range data set requirements. Architecting large scale systems to process thousands
						of requests per minute is a passion of Seth's.
					</p>
				</div>
			</div>
			<div className="col-sm-4 tech-highlight">
				<span className="feature-icon">
					<i className="fa fa-lock icon"></i>
				</span>
				<div className="tech-container">
					<h3>Security</h3>
					<p>
						Everyone has the right to share content securely and anonymously. Systems Seth helps create
						are secure using the latest proven web and cryptographic technologies to keep company
						and user data safe. Sharing data, to only the desired recipient is key.
					</p>
				</div>
			</div>
		</div>
	</section>
);