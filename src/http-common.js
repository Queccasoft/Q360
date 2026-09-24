import axios from "axios";
export default axios.create({
  baseURL:process.env.REACT_APP_SERVER_HTTP+"://"+process.env.REACT_APP_SERVER_IP+":"+process.env.REACT_APP_SERVER_PORT+"/api",
  headers: {
    "Content-type": "application/json"
  }
 
});
