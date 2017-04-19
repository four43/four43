import * as React from 'react';

export const Title = () => (
	<div>
		<div id="title-row" className="row">
			<div id="print-contact" className="print-only contact-info">
				<a id="social-github" className="social-link" href="github.com/four43">
					<i className="fa fa-github-alt" title="View my profile on GitHub - four43"></i>
				</a>
				<a id="social-linkedin" className="social-link" href="linkedin.com/in/four43">
					<i className="fa fa-linkedin-square" title="View my professional profile on LinkedIn"></i>
				</a>
				<a id="social-twitter" className="social-link" href="@seth_j_miller">
					<i className="fa fa-twitter" title="Follow my month to month Twitter updates"></i>
				</a>
				<a id="social-email" className="social-link" href="seth@four43.com">
					<i className="fa fa-envelope" title="Email me directly"></i>
				</a>
			</div>
			<div className="col-sm-5 col-sm-offset-3 block-container header-right-col">
				<h1 className="title">
					<span className="letters">FOUR</span>
					<span className="numbers">43</span>
				</h1>
				<p className="lead">The professional home of&nbsp;
					<span className="name">Seth Miller</span>
				</p>
			</div>
		</div>
		<div id="social-row" className="row">
			<div id="social-container" className="col-xs-3 col-sm-7 col-sm-offset-3 block-container header-right-col">
				<a id="social-github" className="social-link" href="https://github.com/four43">
					<i className="fa fa-github-alt" title="View my profile on GitHub - four43"></i>
				</a>
				<a id="social-linkedin" className="social-link" href="https://www.linkedin.com/in/four43">
					<i className="fa fa-linkedin-square" title="View my professional profile on LinkedIn"></i>
				</a>
				<a id="social-twitter" className="social-link" href="https://twitter.com/seth_j_miller">
					<i className="fa fa-twitter" title="Follow my month to month Twitter updates"></i>
				</a>
				<a id="social-email" className="social-link" href="mailto:seth@four43.com">
					<i className="fa fa-envelope" title="Email me directly"></i>
				</a>
			</div>
		</div>
	</div>
);