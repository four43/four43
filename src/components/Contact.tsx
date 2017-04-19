import * as React from "react";

export const Contact = () => (
	<section id="contact" className="container-fluid plain">
		<div className="row">
			<div className="col-sm-6 col-sm-offset-3">
				<div className="footer-contact-info">
					<h2>Interested?</h2>

					<h3>Seth is available for consulting for your Web or Big Data project:</h3>

					<div className="contact-footer">
						<a className="btn btn-success btn-lg" href="mailto:seth@four43.com"
						   title="Email me directly"><i className="fa fa-envelope"></i> Email</a>
						<a className="btn btn-success btn-lg" href="https://www.linkedin.com/in/four43"
						   title="Message me on LinkedIn"><i className="fa fa-linkedin-square"></i> LinkedIn</a>
					</div>
				</div>
				<div id="print-contact-footer" className="print-only contact-info">
					<h2>Interested?</h2>

					<h3>Contact me:</h3>

					<div>
						<a id="social-email" className="social-link" href="seth@four43.com">
							<i className="fa fa-envelope" title="Email me directly"></i>
						</a>
						<a id="social-linkedin" className="social-link" href="linkedin.com/in/four43">
							<i className="fa fa-linkedin-square"
							   title="View my professional profile on LinkedIn"></i>
						</a>
					</div>
				</div>
			</div>
		</div>
	</section>
)