// Q360 - Client-side office editors suite and workspace manager.
// Copyright (C) 2026 Queccasoft

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
    
import React, { useState, Fragment } from "react"
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import{Nav,Navbar,Container,Badge,OverlayTrigger,Tooltip, Modal, Button, Row} from 'react-bootstrap';
import Home from "./components/Home";
import NoMatch from "./components/NoMatch";
import "../src/Assets/vendor/animate.css/animate.min.css"; 
import "../src/Assets/vendor/bootstrap/css/bootstrap.min.css"; 
import "../src/Assets/vendor/bootstrap-icons/bootstrap-icons.css"; 
import "../src/Assets/vendor/boxicons/css/boxicons.min.css"; 
import "../src/Assets/vendor/glightbox/css/glightbox.min.css"; 
import "../src/Assets/vendor/swiper/swiper-bundle.min.css";
import officeLogo from "../src/Assets/Header/q360/q360.png";
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
const App = () => {
	const [fileUrl, setFileUrl]=useState("/Assets/buttons/DISK.png");
	const [showNoticeModal, setShowNoticeModal] = useState(false);
    const [showCla, setShowCla] = useState(false);
	return (
		<div className="col-sm-12 m-0 p-0">
			<div className="col-sm-12 m-0 p-0"> 

			<div id="header" className="d-flex align-items-center animate__animated animate__fadeInLeft">
				<div className=" col-sm-12 d-flex justify-content-between align-items-center">

				<div className="logo">
					<a><Link to={"/"}><img src="/Assets/Header/Header_01.png" alt="QUECCASOFT" height="100%" width="100%" className="img-fluid h1"></img></Link></a>
				</div>
				<div className="logo">
					<div>
					<a onClick={() => setShowNoticeModal(true)}><Link to={"/"}><img src={officeLogo} alt="QUECCASOFT" className="img-fluid h1"></img></Link></a>
				<a> Q 360</a>
				</div>
				</div>
				
				<div className="social-links d-none d-md-flex align-items-center gap-3">
					<a href="https://www.facebook.com/profile.php?id=100094953160344" className="facebook"><i className="bx bxl-facebook"></i></a>
					<a href="https://instagram.com/queccasoft?igshid=MzRIODBiNWFIZA==" className="instagram"><i className="bx bxl-instagram"></i></a>
					<a href="https://in.linkedin.com/company/queccasoft" className="linkedin"><i className="bx bxl-linkedin"></i></a>
                    <a href="https://groups.google.com/g/q360-community" className="playstore"><i className="bx bxl-google"></i></a>
                    <a className="bi bi-envelope d-flex align-items-center" href="mailto:info@queccasoft.in"></a>
				</div>
				</div>
			</div>

			</div>
			<div class="row col-sm-12 p-0 m-0 animate__animated animate__fadeIn ">
				
				<Routes>
	 			<Route path="/" element={<Home />} />
				<Route path="*" element={<NoMatch />} />
				</Routes>

			</div>

			{/* NOTICE MODAL */}
<Modal 
    show={showNoticeModal} 
    onHide={() => setShowNoticeModal(false)} 
    centered
    backdrop="static"
>
    <Modal.Header closeButton>
        <Modal.Title>✨ Support Q360</Modal.Title>
    </Modal.Header>
    <Modal.Body className="text-center p-4">
        <div className="mb-3">
            <img 
                src={officeLogo} 
                alt="Q360 Logo" 
                style={{ height: '50px', width: 'auto', marginBottom: '15px' }} 
            />
            <h5>Q360 is Open-Source!</h5>
        </div>
        <p>
            Q360 is completely open-source and will be maintained by queccasoft & independent developers. 
            Your donations and contributions directly help us cover server costs, maintain the codebase, 
            and build powerful new features for everyone.
        </p>
        <p>
            Join our Google Group to download from Playstore:<br></br>
            <a href="https://groups.google.com/g/q360-community"><i className="bx bxl-google h1"></i></a> <br></br>
            Playstore App cannot be downloaded without joining Group.
		</p>
        <hr />
        <p className="text-success fw-semibold small mb-0">
             For Donations or contributions contact us on our Google Group.
        </p>
        <Button variant="danger" className="col-sm-3 m-2" href="https://sponsor.queccasoft.in/">
            Sponsor
        </Button>
        <Button variant="success" className="col-sm-3 m-2" href="https://groups.google.com/g/q360-community">
            Donate
        </Button>
    </Modal.Body>
    <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowNoticeModal(false)}>
            Close
        </Button>
    </Modal.Footer>
</Modal>

		</div>
	);
}
export default App;

