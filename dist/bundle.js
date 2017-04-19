/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// identity function for calling harmony imports with the correct context
/******/ 	__webpack_require__.i = function(value) { return value; };
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 9);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

module.exports = React;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
var About = (function (_super) {
    __extends(About, _super);
    function About(props) {
        var _this = _super.call(this, props) || this;
        _this.props = props;
        return _this;
    }
    About.prototype.getAge = function (currentDate) {
        var birthDate = new Date(1989, 6, 30);
        var age = currentDate.getFullYear() - birthDate.getFullYear();
        var month = currentDate.getMonth() - birthDate.getMonth();
        if (month < 0 || (month === 0 && currentDate.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };
    About.prototype.render = function () {
        return (React.createElement("section", { id: "about", className: "container-fluid plain" },
            React.createElement("div", { className: "row" },
                React.createElement("div", { className: "section-header col-sm-4 col-sm-offset-3 section-header" },
                    React.createElement("h2", null, "About"),
                    React.createElement("h3", null, "Data, Security, and the Web"),
                    React.createElement("p", null,
                        "Seth is a ",
                        this.getAge(this.props.now),
                        " year old software developer based out of Minneapolis, Minnesota. He is passionate about the open web and the opportunities it brings to communication and businesses around the world. Using big data processing, combined with smart analytics, and responsive user interfaces, Seth creates real-time applications that solve problems for modern day business needs. Seth holds a Bachelor of Science in Computer Science degree from The University of Minnesota, Twin Cities, College of Science and Engineering."),
                    React.createElement("p", null)),
                React.createElement("div", { id: "headshot-container", className: "col-sm-2" },
                    React.createElement("img", { id: "headshot", title: "Hi, I'm Seth.", src: "./dist/img/headshot.jpg", alt: "Seth's pretty mug", className: "img-circle" })))));
    };
    return About;
}(React.Component));
exports.About = About;


/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
exports.Contact = function () { return (React.createElement("section", { id: "contact", className: "container-fluid plain" },
    React.createElement("div", { className: "row" },
        React.createElement("div", { className: "col-sm-6 col-sm-offset-3" },
            React.createElement("div", { className: "footer-contact-info" },
                React.createElement("h2", null, "Interested?"),
                React.createElement("h3", null, "Seth is available for consulting for your Web or Big Data project:"),
                React.createElement("div", { className: "contact-footer" },
                    React.createElement("a", { className: "btn btn-success btn-lg", href: "mailto:seth@four43.com", title: "Email me directly" },
                        React.createElement("i", { className: "fa fa-envelope" }),
                        " Email"),
                    React.createElement("a", { className: "btn btn-success btn-lg", href: "https://www.linkedin.com/in/four43", title: "Message me on LinkedIn" },
                        React.createElement("i", { className: "fa fa-linkedin-square" }),
                        " LinkedIn"))),
            React.createElement("div", { id: "print-contact-footer", className: "print-only contact-info" },
                React.createElement("h2", null, "Interested?"),
                React.createElement("h3", null, "Contact me:"),
                React.createElement("div", null,
                    React.createElement("a", { id: "social-email", className: "social-link", href: "seth@four43.com" },
                        React.createElement("i", { className: "fa fa-envelope", title: "Email me directly" })),
                    React.createElement("a", { id: "social-linkedin", className: "social-link", href: "linkedin.com/in/four43" },
                        React.createElement("i", { className: "fa fa-linkedin-square", title: "View my professional profile on LinkedIn" })))))))); };


/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
exports.Highlights = function () { return (React.createElement("section", { id: "highlights", className: "container-fluid" },
    React.createElement("div", { className: "row" },
        React.createElement("div", { className: "col-sm-4 tech-highlight" },
            React.createElement("span", { className: "feature-icon" },
                React.createElement("i", { className: "fa fa-cloud icon" })),
            React.createElement("div", { className: "tech-container" },
                React.createElement("h3", null, "Web"),
                React.createElement("p", null, "Experience in connecting users with content they need. Seth has created web APIs, for consumption by other systems and mobile devices. An API centric model is essential for a growing flexible business. Those APIs power user interfaces Seth has created. These complex web apps, using the latest front end technologies, make for fast and responsive user experiences."))),
        React.createElement("div", { className: "col-sm-4 tech-highlight" },
            React.createElement("span", { className: "feature-icon" },
                React.createElement("i", { className: "fa fa-database icon" })),
            React.createElement("div", { className: "tech-container" },
                React.createElement("h3", null, "Big Data"),
                React.createElement("p", null, "With a background in traditional relational databases and experience in the more loose No-SQL data stores, Seth has worked with a broad range of storage systems for a wide range data set requirements. Architecting large scale systems to process thousands of requests per minute is a passion of Seth's."))),
        React.createElement("div", { className: "col-sm-4 tech-highlight" },
            React.createElement("span", { className: "feature-icon" },
                React.createElement("i", { className: "fa fa-lock icon" })),
            React.createElement("div", { className: "tech-container" },
                React.createElement("h3", null, "Security"),
                React.createElement("p", null, "Everyone has the right to share content securely and anonymously. Systems Seth helps create are secure using the latest proven web and cryptographic technologies to keep company and user data safe. Sharing data, to only the desired recipient is key.")))))); };


/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
exports.Nav = function () { return (React.createElement("div", { id: "navbars" },
    React.createElement("nav", { id: "navbar-top", className: "navbar navbar-inverse navbar-fixed-top", role: "navigation" },
        React.createElement("div", { className: "navbar-header" },
            React.createElement("button", { type: "button", className: "navbar-toggle", "data-toggle": "collapse", "data-target": ".navbar-ex1-collapse" },
                React.createElement("span", { className: "sr-only" }, "Toggle navigation"),
                React.createElement("span", { className: "icon-bar" }),
                React.createElement("span", { className: "icon-bar" }),
                React.createElement("span", { className: "icon-bar" })),
            React.createElement("a", { className: "navbar-brand", href: "#" }, "four43")),
        React.createElement("div", { className: "collapse navbar-collapse navbar-ex1-collapse" },
            React.createElement("ul", { className: "nav navbar-nav" },
                React.createElement("li", null,
                    React.createElement("a", { href: "#about" }, "About")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#work" }, "Work")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#projects" }, "Projects")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#values" }, "Values"))))),
    React.createElement("div", { id: "nav-row", className: "row" },
        React.createElement("nav", { id: "main-nav", className: "col-sm-6 col-sm-offset-3 hidden-xs block-container", role: "navigation" },
            React.createElement("ul", { className: "nav nav-pills" },
                React.createElement("li", null,
                    React.createElement("a", { href: "#about" }, "About")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#work" }, "Work")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#projects" }, "Projects")),
                React.createElement("li", null,
                    React.createElement("a", { href: "#values" }, "Values"))))))); };


/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
exports.Projects = function () { return (React.createElement("section", { id: "projects", className: "container-fluid" },
    React.createElement("div", { className: "section-header row" },
        React.createElement("div", { className: "content-container col-sm-6 col-sm-offset-3" },
            React.createElement("h2", null, "Projects"),
            React.createElement("h3", null, "Open-Source development"))),
    React.createElement("ul", null,
        React.createElement("li", { className: "row" },
            React.createElement("div", { className: "content-container col-sm-6 col-sm-offset-3" },
                React.createElement("h3", null,
                    "Crisp Cache -\u00A0",
                    React.createElement("a", { className: "lead", href: "https://github.com/four43/admiral-cli" }, "github.com/four43/crisp-cache")),
                React.createElement("p", null, "An always up to date cache for high throughput applications. Crisp Cache adds \"stale\" to the lifecycle of a cache element. Stale entries are used from the cache while Crisp Cache fetches new cache entries in the background. Responsive applications need reliable consistent streams of data, and Crisp Cache fills the void over other caches that may block when an entry is expired or goes past it's TTL."))),
        React.createElement("li", { className: "row" },
            React.createElement("div", { className: "content-container col-sm-6 col-sm-offset-3" },
                React.createElement("h3", null,
                    "Admiral CLI -\u00A0",
                    React.createElement("a", { className: "lead", href: "https://github.com/four43/admiral-cli" }, "github.com/four43/admiral-cli")),
                React.createElement("p", null,
                    "Admiral-CLI is a Command Line Framework (CLI) framework for Node.js. There are other CLI frameworks available for Node.js already, however Admiral adds validation and some callbacks in key places to make apps easier to write. We wanted to create a framework with less configuration but stronger validation.",
                    React.createElement("br", null),
                    React.createElement("br", null),
                    "Configuration should be easy to understand while CLI parameters are strictly validated and appropriate error messages are passed on to the user. A CLI is a user interface, let's treat it like one."))),
        React.createElement("li", { className: "row" },
            React.createElement("div", { className: "content-container col-sm-6 col-sm-offset-3" },
                React.createElement("h3", null,
                    "Cite API -\u00A0",
                    React.createElement("a", { className: "lead", href: "https://github.com/four43/cite-api" }, "github.com/four43/cite-api")),
                React.createElement("p", null, "Documentation is always difficult to create and keep up to date. Cite API aims to step in and ease the creation for RESTful APIs. It looks at JSON Schema, the same schema that is tested as correct API input/output and generates beautiful docs based on that. Much like Swagger, but with less configuration, as the configuration is already the tested schema. This project is in the very early stages of development but the need is high for better documentation tools."))),
        React.createElement("li", { className: "row" },
            React.createElement("div", { className: "content-container col-sm-6 col-sm-offset-3" },
                React.createElement("h3", null,
                    "SleepyTable -\u00A0",
                    React.createElement("a", { className: "lead", href: "https://github.com/hamweather/sleepytable" }, "github.com/hamweather/sleepytable")),
                React.createElement("p", null, "SleepyTable is an open source project sponsored by AerisWeather. It was designed to ingest web API's and allow for paging, filtering, and sorting server side. It is open source and is looking for more developers for the project. It was originally developed as a jQuery plugin and is a little dated now, but is still used in production. I would like to update it with a more modern framework like Bootstrap possibly React or Angular.")))))); };


/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
exports.Title = function () { return (React.createElement("div", null,
    React.createElement("div", { id: "title-row", className: "row" },
        React.createElement("div", { id: "print-contact", className: "print-only contact-info" },
            React.createElement("a", { id: "social-github", className: "social-link", href: "github.com/four43" },
                React.createElement("i", { className: "fa fa-github-alt", title: "View my profile on GitHub - four43" })),
            React.createElement("a", { id: "social-linkedin", className: "social-link", href: "linkedin.com/in/four43" },
                React.createElement("i", { className: "fa fa-linkedin-square", title: "View my professional profile on LinkedIn" })),
            React.createElement("a", { id: "social-twitter", className: "social-link", href: "@seth_j_miller" },
                React.createElement("i", { className: "fa fa-twitter", title: "Follow my month to month Twitter updates" })),
            React.createElement("a", { id: "social-email", className: "social-link", href: "seth@four43.com" },
                React.createElement("i", { className: "fa fa-envelope", title: "Email me directly" }))),
        React.createElement("div", { className: "col-sm-5 col-sm-offset-3 block-container header-right-col" },
            React.createElement("h1", { className: "title" },
                React.createElement("span", { className: "letters" }, "FOUR"),
                React.createElement("span", { className: "numbers" }, "43")),
            React.createElement("p", { className: "lead" },
                "The professional home of\u00A0",
                React.createElement("span", { className: "name" }, "Seth Miller")))),
    React.createElement("div", { id: "social-row", className: "row" },
        React.createElement("div", { id: "social-container", className: "col-xs-3 col-sm-7 col-sm-offset-3 block-container header-right-col" },
            React.createElement("a", { id: "social-github", className: "social-link", href: "https://github.com/four43" },
                React.createElement("i", { className: "fa fa-github-alt", title: "View my profile on GitHub - four43" })),
            React.createElement("a", { id: "social-linkedin", className: "social-link", href: "https://www.linkedin.com/in/four43" },
                React.createElement("i", { className: "fa fa-linkedin-square", title: "View my professional profile on LinkedIn" })),
            React.createElement("a", { id: "social-twitter", className: "social-link", href: "https://twitter.com/seth_j_miller" },
                React.createElement("i", { className: "fa fa-twitter", title: "Follow my month to month Twitter updates" })),
            React.createElement("a", { id: "social-email", className: "social-link", href: "mailto:seth@four43.com" },
                React.createElement("i", { className: "fa fa-envelope", title: "Email me directly" })))))); };


/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
var ReactDOM = __webpack_require__(10);
var Values = (function (_super) {
    __extends(Values, _super);
    function Values(props) {
        var _this = _super.call(this, props) || this;
        _this.state = {};
        return _this;
    }
    Values.prototype.componentDidMount = function () {
        this.getHeights();
    };
    Values.prototype.getHeights = function () {
        var largestHeight = null;
        for (var i = 0; i < 3; i++) {
            var height = ReactDOM.findDOMNode(this.refs['col-' + i]).clientHeight;
            if (largestHeight === null || height > largestHeight) {
                largestHeight = height;
            }
        }
        this.setState({ maxHeight: largestHeight });
    };
    Values.prototype.render = function () {
        var columnStyle = {};
        if (this.state.maxHeight) {
            columnStyle.height = this.state.maxHeight + "px";
        }
        return (React.createElement("section", { id: "values", className: "container-fluid plain" },
            React.createElement("div", { className: "section-header row" },
                React.createElement("div", { className: "col-sm-12" },
                    React.createElement("h2", null, "Thoughts"),
                    React.createElement("h3", null, "Other values and goals."))),
            React.createElement("ul", { className: "row" },
                React.createElement("li", { className: "col-sm-4", ref: "col-0", style: columnStyle },
                    React.createElement("div", { className: "content-container" },
                        React.createElement("h3", null, "Real Value"),
                        React.createElement("p", null, "Create software that is beneficial. Good developers and good software companies create products that have value to real people. Software helps people, keeps them safe, or helps them more efficiently create other products to help other people. I want to be a part of that."))),
                React.createElement("li", { className: "col-sm-4", ref: "col-1", style: columnStyle },
                    React.createElement("div", { className: "content-container" },
                        React.createElement("h3", null, "Transparency"),
                        React.createElement("p", null, "Be verbose, open, and truthful. Free speech and the world's knowledge at our fingertips are things I don't take lightly living in the US. Everyone deserves transparency from their government, to know full history, and have the ability to openly share thoughts with everyone or only the ones they care about."))),
                React.createElement("li", { className: "col-sm-4", ref: "col-2", style: columnStyle },
                    React.createElement("div", { className: "content-container" },
                        React.createElement("h3", null, "Defect"),
                        React.createElement("p", null, "Innovation never comes from those that follow norms. People who go against the grain find opportunities for improvement and new solutions."))))));
    };
    return Values;
}(React.Component));
exports.Values = Values;


/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
var moment = __webpack_require__(11);
var Work = (function (_super) {
    __extends(Work, _super);
    function Work(props) {
        var _this = _super.call(this, props) || this;
        _this.state = {
            aerisWeatherMoreShowing: false,
            uOfMMoreShowing: false,
            currentEmploymentStart: moment("2011-02-01", "YYYY-MM-DD")
        };
        return _this;
    }
    Work.prototype.toggle = function (id) {
        if (this.state[id] !== undefined) {
            var newState = {};
            newState[id] = !this.state[id];
            this.setState(newState);
        }
        else {
            throw new Error("Couldn't toggle the state of " + id + " because that isn't a section we manage.");
        }
        /*console.log(this.state);
         alert(id);
         console.log(React.findDOMNode(this.refs[id]));*/
    };
    Work.prototype.render = function () {
        var _this = this;
        var aerisWeatherMoreClasses = [
            'work-more'
        ];
        if (this.state.aerisWeatherMoreShowing) {
            aerisWeatherMoreClasses.push('show');
        }
        var uOfMMoreClasses = [
            'work-more'
        ];
        if (this.state.uOfMMoreShowing) {
            uOfMMoreClasses.push('show');
        }
        var aerisWeatherMoreText = (this.state.aerisWeatherMoreShowing) ? 'Less -' : 'More +';
        var uOfMMoreText = (this.state.uOfMMoreShowing) ? 'Less -' : 'More +';
        var now = moment();
        var currentEmploymentDuration = moment.duration(now.diff(this.state.currentEmploymentStart)).humanize();
        console.log(currentEmploymentDuration);
        return (React.createElement("section", { id: "work", className: "container-fluid plain" },
            React.createElement("div", { className: "section-header row" },
                React.createElement("div", { className: "col-sm-6 col-sm-offset-3" },
                    React.createElement("h2", null, "Work Experience"),
                    React.createElement("h3", null, "Professional employment"))),
            React.createElement("ol", { className: "job-list" },
                React.createElement("li", { className: "row" },
                    React.createElement("div", { className: "col-sm-6 col-sm-offset-3" },
                        React.createElement("h3", null, "AerisWeather"),
                        React.createElement("h4", null, "Senior Software Developer"),
                        React.createElement("span", { className: "experience-date" },
                            React.createElement("time", { dateTime: "2011-02-01" }, "February 2011"),
                            "-",
                            React.createElement("time", null, "Present"),
                            React.createElement("time", null,
                                " (~",
                                currentEmploymentDuration,
                                ")")),
                        React.createElement("p", { className: "description" }, "At AerisWeather, Seth has created a variety of API backed web applications. He has had the opportunity to lead projects through the whole life cycle from conception, through planning, design, as well as full backend and frontend execution. APIs have been key AerisWeather's success as a flexible small company and designing them has been very exciting. AerisWeather works with a variety of data sources and technologies to fulfill their clients needs, also allowing Seth to learn a diverse skill set."),
                        React.createElement("button", { className: "btn btn-link btn-lg", onClick: function () { return _this.toggle('aerisWeatherMoreShowing'); } }, aerisWeatherMoreText),
                        React.createElement("div", { className: aerisWeatherMoreClasses.join(',') },
                            "Here are more technical details:",
                            React.createElement("ul", { className: "details" },
                                React.createElement("li", null, "System administration LAMP stack (Linux, Apache, MySQL, PHP)"),
                                React.createElement("li", null, "Transition to Node.js and asynchronous and event based programming"),
                                React.createElement("li", null, "Enterprise grade applications built on Zend Framework with Simfony components"),
                                React.createElement("li", null, "MongoDB as a large scale data store, thousands of writes per second."),
                                React.createElement("li", null, "Primary cloud developer/DevOps - Amazon Web Services (AWS)"),
                                React.createElement("li", null, "Docker container deployment and administration with Kubernetes and Docker-Compose"),
                                React.createElement("li", null, "We utilize a variety of AWS resources, EC2, ElasticBeanstalk, SQS, SNS, etc."),
                                React.createElement("li", null, "Multiple data sources and parsers, from raw binary TCP sockets to other web APIs, JSON, and SOAP"),
                                React.createElement("li", null, "API Design - According to best practice full REST APIs"),
                                React.createElement("li", null, "JSON is used as the main transport data format"),
                                React.createElement("li", null, "API creation for mobile applications"),
                                React.createElement("li", null, "OAuth2 protected APIs, full stack security implementation"),
                                React.createElement("li", null, "Graphic design experience in Adobe Photoshop"),
                                React.createElement("ul", null,
                                    React.createElement("li", null, "User interface wireframing"),
                                    React.createElement("li", null, "User interface mockups"),
                                    React.createElement("li", null, "Full production graphics and assets")))))),
                React.createElement("li", { className: "row" },
                    React.createElement("div", { className: "col-sm-6 col-sm-offset-3" },
                        React.createElement("h3", null, "The University of Minnesota"),
                        React.createElement("h4", null, "Undergraduate Web/Database Developer"),
                        React.createElement("span", { className: "experience-date" },
                            React.createElement("time", { dateTime: "2008-09-01" }, "September 2008"),
                            "-",
                            React.createElement("time", { dateTime: "2011-02-01" }, "February 2011"),
                            React.createElement("time", null, " (2 years 6 months)")),
                        React.createElement("p", { className: "description" }, "With the opportunity to try many aspects of IT, including network administration, server administration, software development and help desk, I found I enjoyed software development the best. We created many internal apps for faculty and staff and helped deploy a host of new services."),
                        React.createElement("button", { className: "btn btn-link btn-lg", onClick: function () { return _this.toggle('uOfMMoreShowing'); } }, uOfMMoreText),
                        React.createElement("div", { className: uOfMMoreClasses.join(',') },
                            "Here are more technical details:",
                            React.createElement("ul", { className: "details" },
                                React.createElement("li", null, "Intro to full stack management for LAMP stack (Linux, Apache, MySQL, PHP)"),
                                React.createElement("li", null, "Many internal web applications for staff and faculty"),
                                React.createElement("li", null, "Excellent introduction to Server Administration, Networking, and Development"),
                                React.createElement("li", null, "Mostly PHP and Javascript, Object Oriented programming"),
                                React.createElement("li", null, "Introduction to networking and Cisco IOS"),
                                React.createElement("li", null, "First experience administrating Linux systems in a production environment"),
                                React.createElement("li", null, "Data center wiring"),
                                React.createElement("li", null, "Help desk support, a lot of interaction with faculty, staff, and grad students"),
                                React.createElement("li", null, "Graphic design in Adobe Photoshop and Illustrator"),
                                React.createElement("ul", null,
                                    React.createElement("li", null, "Application assets"),
                                    React.createElement("li", null, "Cover for an international magazine")))))))));
    };
    return Work;
}(React.Component));
exports.Work = Work;


/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var React = __webpack_require__(0);
var About_1 = __webpack_require__(1);
var Contact_1 = __webpack_require__(2);
var Highlights_1 = __webpack_require__(3);
var Nav_1 = __webpack_require__(4);
var Projects_1 = __webpack_require__(5);
var Title_1 = __webpack_require__(6);
var Values_1 = __webpack_require__(7);
var Work_1 = __webpack_require__(8);
var App = (function (_super) {
    __extends(App, _super);
    function App(props) {
        var _this = _super.call(this, props) || this;
        console.log("\n ___                 _  _  ____  \n/  _|               | || ||___ \\\n| |_ ___  _   _ _ __| || |_ __) |\n|  _/ _ \\| | | | '__|__   _|__ <\n| || (_) | |_| | |     | | ___) |\n|_| \\___/ \\__,_|_|     |_||____/\n\nThe professional home of Seth Miller. Please take a look around.\n\nThis website was created using Typescript and React, a bit much for a simple page, but it's fun, and that's what\npersonal sites are for.\nThe full source is available at: https://github.com/four43/four43/tree/gh-pages\n\nLike what you see? Contact me: seth@four43.com\n");
        return _this;
    }
    App.prototype.render = function () {
        return (React.createElement("div", null,
            React.createElement("header", null,
                React.createElement(Nav_1.Nav, null),
                React.createElement(Title_1.Title, null)),
            React.createElement(About_1.About, { now: new Date() }),
            React.createElement(Highlights_1.Highlights, null),
            React.createElement(Work_1.Work, null),
            React.createElement(Projects_1.Projects, null),
            React.createElement(Values_1.Values, null),
            React.createElement(Contact_1.Contact, null)));
    };
    return App;
}(React.Component));
exports.App = App;


/***/ }),
/* 10 */
/***/ (function(module, exports) {

module.exports = ReactDOM;

/***/ }),
/* 11 */
/***/ (function(module, exports) {

module.exports = moment;

/***/ })
/******/ ]);
//# sourceMappingURL=bundle.js.map