import * as React from 'react';

export const Nav = () => (
	<div id="navbars">
		<nav id="navbar-top" className="navbar navbar-inverse navbar-fixed-top" role="navigation">
			<div className="navbar-header">
				<button type="button" className="navbar-toggle" data-toggle="collapse"
				        data-target=".navbar-ex1-collapse">
					<span className="sr-only">Toggle navigation</span>
					<span className="icon-bar"></span>
					<span className="icon-bar"></span>
					<span className="icon-bar"></span>
				</button>
				<a className="navbar-brand" href="#">four43</a>
			</div>

			<div className="collapse navbar-collapse navbar-ex1-collapse">
				<ul className="nav navbar-nav">
					<li><a href="#about">About</a></li>
					<li><a href="#work">Work</a></li>
					<li><a href="#projects">Projects</a></li>
					<li><a href="#values">Values</a></li>
				</ul>
			</div>
		</nav>
		<div id="nav-row" className="row">
			<nav id="main-nav" className="col-sm-6 col-sm-offset-3 hidden-xs block-container" role="navigation">
				<ul className="nav nav-pills">
					<li>
						<a href="#about">About</a>
					</li>
					<li>
						<a href="#work">Work</a>
					</li>
					<li>
						<a href="#projects">Projects</a>
					</li>
					<li>
						<a href="#values">Values</a>
					</li>
				</ul>
			</nav>
		</div>
	</div>
);