/* eslint-disable */
import React from "react"
import { Modal } from "react-bootstrap";

const NoMatch = () => {
	return (
		<div id="nomatch">
			<Modal fullscreen={true} show={true} className="modal" >
				<Modal.Body id="nomatch">
					<div class="row justify-content-center mt-5">
						<div class="col-8 mt-5">
							<a className="display-1">:/</a>
						</div>
					</div>

					<div class="row justify-content-center mt-1">
						<div class="col-8">
							<h1>No matching found for given URL</h1>
						</div>
					</div>

					<div class="row justify-content-center mt-1">
						<div class="col-8">
							<h3>Please ensure the URL is correct.</h3>
						</div>
					</div>

					<div class="row justify-content-center mt-1">
						<div class="col-8">
							<h5>This is likely caused due to:</h5>
							<li>Typing a wrong URL or browser autocorrecting the URL.</li>
							<li>Using an old URL link on a new updated version of the software.</li>
						</div>
					</div>
					
				</Modal.Body>
			</Modal>
		</div>

	);
};



export default NoMatch;
