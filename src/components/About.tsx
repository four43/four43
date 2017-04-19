import * as React from 'react';

export class About extends React.Component<AboutProps, AboutState> {

	constructor(public props: AboutProps) {
		super(props);
	}

	getAge(currentDate:Date) {
		let birthDate = new Date(1989, 6, 30);
		let age = currentDate.getFullYear() - birthDate.getFullYear();
		let month = currentDate.getMonth() - birthDate.getMonth();
		if (month < 0 || (month === 0 && currentDate.getDate() < birthDate.getDate())) {
			age--;
		}
		return age;
	}

	render() {
		return (
			<section id="about" className="container-fluid plain">
				<div className="row">
					<div className="section-header col-sm-4 col-sm-offset-3 section-header">

						<h2>About</h2>
						<h3>Data, Security, and the Web</h3>
						<p>
							Seth is a {this.getAge(this.props.now)} year old software developer based out of Minneapolis, Minnesota. He is passionate about
							the open web and the opportunities it brings to communication and businesses around the
							world. Using big data processing, combined with smart analytics, and responsive user
							interfaces,
							Seth creates real-time applications that solve problems for modern day business needs. Seth
							holds
							a Bachelor of Science in Computer Science degree from The University of Minnesota, Twin
							Cities,
							College of Science and Engineering.
						</p>
						<p>

						</p>
					</div>
					<div id="headshot-container" className="col-sm-2">
						<img id="headshot" title="Hi, I'm Seth." src="./dist/img/headshot.jpg" alt="Seth's pretty mug" className="img-circle"/>
					</div>
				</div>
			</section>
		)
	}
}

interface AboutState {
	now: Date;
}

interface AboutProps {
	now: Date;
}