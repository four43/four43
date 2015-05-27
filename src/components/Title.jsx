import React from 'react';

export default
class Title extends React.Component {
    render() {
        return (
            <div>
                <div id="title-row" className="row">
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
                        <a id="social-github" className="social-link" href="https://github.com/cr125rider">
                            <i className="fa fa-github-alt" title="Fork me on GitHub - cr125rider"></i>
                        </a>
                        <a id="social-linkedin" className="social-link" href="http://www.linkedin.com/profile/view?id=57827297">
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
    }
}