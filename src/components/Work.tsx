import * as React from 'react';
import * as moment from 'moment';

export class Work extends React.Component<{}, WorkState> {
	constructor(props: {}) {
		super(props);

		this.state = {
			aerisWeatherMoreShowing: false,
			uOfMMoreShowing: false,
			currentEmploymentStart: moment("2011-02-01", "YYYY-MM-DD")
		};
	}

	toggle(id: string) {
		if (this.state[id] !== undefined) {
			let newState: { [id: string]: any } = {};
			newState[id] = !this.state[id];
			this.setState(newState);
		}
		else {
			throw new Error(`Couldn't toggle the state of ${id} because that isn't a section we manage.`);
		}
		/*console.log(this.state);
		 alert(id);
		 console.log(React.findDOMNode(this.refs[id]));*/
	}

	render() {
		let aerisWeatherMoreClasses = [
			'work-more'
		];
		if (this.state.aerisWeatherMoreShowing) {
			aerisWeatherMoreClasses.push('show');
		}

		let uOfMMoreClasses = [
			'work-more'
		];
		if (this.state.uOfMMoreShowing) {
			uOfMMoreClasses.push('show');
		}

		let aerisWeatherMoreText = (this.state.aerisWeatherMoreShowing) ? 'Less -' : 'More +';
		let uOfMMoreText = (this.state.uOfMMoreShowing) ? 'Less -' : 'More +';

		let now = moment();
		let currentEmploymentDuration = moment.duration(now.diff(this.state.currentEmploymentStart)).humanize();
		console.log(currentEmploymentDuration);

		return (
			<section id="work" className="container-fluid plain">
				<div className="section-header row">
					<div className="col-sm-6 col-sm-offset-3">
						<h2>Work Experience</h2>
						<h3>Professional employment</h3>
					</div>
				</div>
				<ol className="job-list">
					<li className="row">
						<div className="col-sm-6 col-sm-offset-3">
							<h3>AerisWeather</h3>
							<h4>Senior Software Developer</h4>
							<span className="experience-date">
								<time dateTime="2011-02-01">February 2011</time>
								-
								<time>Present</time>
								<time> (~{currentEmploymentDuration})</time>
							</span>
							<p className="description">
								At AerisWeather, Seth has created a variety of
								API backed web applications. He has had the opportunity to lead
								projects through the whole life cycle from conception, through planning,
								design, as well as full backend and frontend execution. APIs have been key
								AerisWeather's success as a flexible small company and designing them has been
								very exciting. AerisWeather works with a variety of data sources and technologies
								to fulfill their clients needs, also allowing Seth to learn a diverse skill set.
							</p>
							<button className="btn btn-link btn-lg"
							        onClick={() => this.toggle('aerisWeatherMoreShowing')}>{aerisWeatherMoreText}</button>
							<div className={aerisWeatherMoreClasses.join(',')}>
								Here are more technical details:
								<ul className="details">
									<li>System administration LAMP stack (Linux, Apache, MySQL, PHP)</li>
									<li>Transition to Node.js and asynchronous and event based programming</li>
									<li>Enterprise grade applications built on Zend Framework with Simfony components
									</li>
									<li>MongoDB as a large scale data store, thousands of writes per second.</li>
									<li>Primary cloud developer/DevOps - Amazon Web Services (AWS)</li>
									<li>Docker container deployment and administration with Kubernetes and
										Docker-Compose
									</li>
									<li>We utilize a variety of AWS resources, EC2, ElasticBeanstalk, SQS, SNS, etc.
									</li>
									<li>Multiple data sources and parsers, from raw binary TCP sockets to other web
										APIs, JSON, and SOAP
									</li>
									<li>API Design - According to best practice full REST APIs</li>
									<li>JSON is used as the main transport data format</li>
									<li>API creation for mobile applications</li>
									<li>OAuth2 protected APIs, full stack security implementation</li>
									<li>Graphic design experience in Adobe Photoshop</li>
									<ul>
										<li>User interface wireframing</li>
										<li>User interface mockups</li>
										<li>Full production graphics and assets</li>
									</ul>
								</ul>
							</div>
						</div>
					</li>
					<li className="row">
						<div className="col-sm-6 col-sm-offset-3">
							<h3>The University of Minnesota</h3>
							<h4>Undergraduate Web/Database Developer</h4>
							<span className="experience-date">
                                <time dateTime="2008-09-01">September 2008</time>
                                -
                                <time dateTime="2011-02-01">February 2011</time>
                                <time> (2 years 6 months)</time>
                            </span>
							<p className="description">
								With the opportunity to try many aspects of IT, including
								network administration, server administration, software development and
								help desk, I found I enjoyed software development the best. We created many
								internal apps for faculty and staff and helped deploy a host of new services.
							</p>
							<button className="btn btn-link btn-lg"
							        onClick={() => this.toggle('uOfMMoreShowing')}>{uOfMMoreText}</button>
							<div className={uOfMMoreClasses.join(',')}>
								Here are more technical details:
								<ul className="details">
									<li>Intro to full stack management for LAMP stack (Linux, Apache, MySQL, PHP)</li>
									<li>Many internal web applications for staff and faculty</li>
									<li>Excellent introduction to Server Administration, Networking, and Development
									</li>
									<li>Mostly PHP and Javascript, Object Oriented programming</li>
									<li>Introduction to networking and Cisco IOS</li>
									<li>First experience administrating Linux systems in a production environment</li>
									<li>Data center wiring</li>
									<li>Help desk support, a lot of interaction with faculty, staff, and grad students
									</li>
									<li>Graphic design in Adobe Photoshop and Illustrator</li>
									<ul>
										<li>Application assets</li>
										<li>Cover for an international magazine</li>
									</ul>
								</ul>
							</div>
						</div>
					</li>

				</ol>
			</section>
		)
	}
}

interface WorkState {
	aerisWeatherMoreShowing: boolean;
	uOfMMoreShowing: boolean;
	currentEmploymentStart: moment.Moment;
	[id: string]: any
}