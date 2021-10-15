import React, { useEffect, useState } from "react";
import "./App.css";
import Select from "react-select";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import axios from 'axios'

const cdkOutputs = require('./cdk-outputs.json')

const App = () => {
	const [voiceConnectors, setVoiceConnectors] = useState([]);
	const [phoneNumbers, setPhoneNumbers] = useState([]);
	const [serviceOptionValue, setServiceOptionValue] = useState(0);
	const [forwardNumberValue, setForwardNumberValue] = useState("");
	const [removeForwardNumberValue, setRemoveForwardNumberValue] = useState("");
	const [voiceConnectorValue, setvoiceConnectorValue] = useState("");
	const [forwardToNumberValue, setForwardToNumberValue] = useState("");


	const url = cdkOutputs.CallForwardingWithSMAStack.chimeAPI

	const handleServiceSelection = (serviceOptionValue) => {
		if (serviceOptionValue != null) {
			console.log("Service Selected: " + serviceOptionValue.value);
			setServiceOptionValue(serviceOptionValue);
		} else {
			setServiceOptionValue(0);
		}
	};

	const handleSelectForwardNumber = (forwardNumberValue) => {
		if (forwardNumberValue != null) {
			console.log("Set forward for: " + forwardNumberValue.value);
			setForwardNumberValue(forwardNumberValue);
		} else {
			setForwardNumberValue(0);
		}
	};

	const handleSelectRemoveForwardNumber = (removeForwardNumberValue) => {
		if (removeForwardNumberValue != null) {
			console.log("Remove forward from: " + removeForwardNumberValue.value);
			setRemoveForwardNumberValue(removeForwardNumberValue);
		} else {
			setRemoveForwardNumberValue(0);
		}
	};

	const handleSelectVoiceConnector = (voiceConnectorValue) => {
		if (voiceConnectorValue != null) {
			console.log("Associate number with: " + voiceConnectorValue.value);
			setvoiceConnectorValue(voiceConnectorValue);
		} else {
			setvoiceConnectorValue(0);
		}
	};

	const handleChangeForward = (forwardToNumberValue) => {
		if (forwardToNumberValue != null) {
			setForwardToNumberValue(forwardToNumberValue);
		} else {
			setForwardToNumberValue("");
		}
	};

	const handleSubmitForward = async (event) => {
		event.preventDefault();
		console.log("Forward number to: " + forwardToNumberValue)
		if (isValidPhoneNumber(forwardToNumberValue)) {
			const body = {
				PhoneNumber: forwardNumberValue.value,
				ProductType: "SipMediaApplicationDialIn",
				ForwardToNumber: forwardToNumberValue,
			}
			try {
				const phoneNumberResponse = await axios.post(
					url + "updateNumber",
					body
				);
				if (phoneNumberResponse.status === 200) {
					alert(
						forwardNumberValue.value + " has been forwarded to " + forwardToNumberValue
					)
					setServiceOptionValue(0)
					setvoiceConnectorValue()
					setRemoveForwardNumberValue(0)
					setForwardNumberValue()
				}
			} catch (err) {
				alert(err + "\n" +  err.response.data)
			}
		} else {
			alert(
				forwardToNumberValue +
				" is NOT a valid phone number.  Please enter a valid E.164 number"
			);
			setForwardToNumberValue("");
		}
	};

	const handleSubmitRemove = async (event) => {
		event.preventDefault();
		const body = {
			PhoneNumber: removeForwardNumberValue.value,
			ProductType: "VoiceConnector",
			VoiceConnectorId: voiceConnectorValue.value,
		}
		try {
			const phoneNumberResponse = await axios.post(
				url + "updateNumber",
				body
			);
			if (phoneNumberResponse.status === 200) {
				alert(
					"Forward on " + removeForwardNumberValue.value + " has been removed and number assigned to Voice Connector" + voiceConnectorValue.value
				)
				setServiceOptionValue(0)
				setvoiceConnectorValue()
				setRemoveForwardNumberValue(0)
				setForwardNumberValue()
			}
		} catch (err) {
			alert(err + "\n" +  err.response.data)
		}
	};

	const serviceOptions = [
		{ label: "Forward a Number", value: "AddForward" },
		{ label: "Remove a Forward", value: "RemoveForward" },
	];

	const forwardableNumbers = phoneNumbers
		.filter(number => number.Status !== 'ReleaseInProgress' && number.ProductType !== 'BusinessCalling')
		.map(number => {
			const forwardableNumbersOptions = {};
			forwardableNumbersOptions.label =
				number.E164PhoneNumber +
				" - " +
				number.ProductType +
				" - " +
				number.Status;
			forwardableNumbersOptions.value = number.E164PhoneNumber;

			return forwardableNumbersOptions;
		});

	const voiceConnectorOptions = voiceConnectors.map((voiceConnector) => {
		const voiceConnectorArray = {};
		voiceConnectorArray.label = voiceConnector.Name;
		voiceConnectorArray.value = voiceConnector.VoiceConnectorId;

		return voiceConnectorArray;
	});

	const canRemoveForwardNumbers = phoneNumbers
		.filter((number) => number.ProductType === "SipMediaApplicationDialIn" && number.Status !== 'ReleaseInProgress')
		.map((number) => {
			const canRemoveForwardNumbersOptions = {};
			canRemoveForwardNumbersOptions.label = number.E164PhoneNumber;
			canRemoveForwardNumbersOptions.value = number.E164PhoneNumber;

			return canRemoveForwardNumbersOptions;
		});

	useEffect(() => {

		const fetchVoiceConnectors = async () => {
			const body = {}
			try {
				const voiceConnectorResponse = await axios.post(
					url + "listVoiceConnectors",
					body
				);
				setVoiceConnectors(voiceConnectorResponse.data.VoiceConnectors);
			} catch (error) {
				console.log("error", error);
			}
		};

		const fetchPhoneNumbers = async () => {
			const body = {}
			try {
				const phoneNumberResponse = await axios.post(
					url + "queryNumber",
					body
				);
				setPhoneNumbers(phoneNumberResponse.data.PhoneNumbers);
			} catch (error) {
				console.log("error", error);
			}
		};

		fetchVoiceConnectors();
		fetchPhoneNumbers();
	}, [serviceOptionValue, url]);

	return (
		<div>
			<label>Select Action</label>
			<Select
				value={serviceOptionValue}
				onChange={handleServiceSelection}
				options={serviceOptions}
				isClearable
			/>
			<div>
				<div>
					{serviceOptionValue.value === 'AddForward' && (
						<div>
							<p></p>
							<label>Select Number</label>
							<Select
								value={forwardNumberValue}
								onChange={handleSelectForwardNumber}
								options={forwardableNumbers}
								isClearable
							/>
							<div>
								<p></p>
								{forwardNumberValue && (
									<div>
										<form onSubmit={handleSubmitForward}>
											<label>
												Number to Foward To:
												<PhoneInput
													placeholder="Enter phone number"
													defaultCountry="US"
													international
													withCountryCallingCode
													value={forwardToNumberValue.value}
													onChange={handleChangeForward}
												/>
											</label>
											<input type="submit" value="Submit" />
										</form>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				<div>
					{serviceOptionValue.value === 'RemoveForward' && (
						<div>
							<p></p>
							<label>Select Number</label>
							<Select
								value={removeForwardNumberValue}
								onChange={handleSelectRemoveForwardNumber}
								options={canRemoveForwardNumbers}
								isClearable
							/>
							<div>
								{removeForwardNumberValue.value && (
									<div>
										<p></p>
										<label>Select VoiceConnector</label>
										<Select
											value={voiceConnectorValue}
											onChange={handleSelectVoiceConnector}
											options={voiceConnectorOptions}
											isClearable
										/>
										<div>
											<p></p>
											{voiceConnectorValue && (
												<div>
													<form onSubmit={handleSubmitRemove}>
														<input type="submit" value="Submit" />
													</form>
												</div>
											)}
										</div>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default App;
