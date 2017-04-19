import * as React from 'react';
import * as ReactDOM from 'react-dom'

export class Values extends React.Component<{}, ValuesState> {

	constructor(props:{}) {
		super(props);
		this.state = {};
	}

	componentDidMount() {
		this.getHeights();
	}

	getHeights() {
		let largestHeight = null;
		for (let i = 0; i < 3; i++) {
			let height = ReactDOM.findDOMNode(this.refs['col-' + i]).clientHeight;
			if (largestHeight === null || height > largestHeight) {
				largestHeight = height;
			}
		}
		this.setState({maxHeight: largestHeight});
	}

	render() {
		let columnStyle: { height?: string } = {};
		if (this.state.maxHeight) {
			columnStyle.height = `${this.state.maxHeight}px`;
		}
		return (
			<section id="values" className="container-fluid plain">
				<div className="section-header row">
					<div className="col-sm-12">
						<h2>Thoughts</h2><h3>Other values and goals.</h3>
					</div>
				</div>
				<ul className="row">
					<li className="col-sm-4" ref="col-0" style={columnStyle}>
						<div className="content-container">
							<h3>Real Value</h3>
							<p>
								Create software that is beneficial. Good developers and good software companies create
								products
								that have value to real people. Software helps people, keeps them safe, or helps them
								more efficiently
								create other products to help other people. I want to be a part of that.
							</p>
						</div>
					</li>
					<li className="col-sm-4" ref="col-1" style={columnStyle}>
						<div className="content-container">
							<h3>Transparency</h3>
							<p>
								Be verbose, open, and truthful. Free speech and the world's knowledge at our fingertips
								are things I don't take lightly living in the US. Everyone deserves transparency from
								their
								government, to know full history, and have the ability to openly share thoughts with
								everyone
								or only the ones they care about.
							</p>
						</div>
					</li>
					<li className="col-sm-4" ref="col-2" style={columnStyle}>
						<div className="content-container">
							<h3>Defect</h3>
							<p>
								Innovation never comes from those that follow norms. People who go against the grain
								find
								opportunities for improvement and new solutions.
							</p>
						</div>
					</li>
				</ul>
			</section>
		)
	}
}

interface ValuesState{
	maxHeight?: number;
}