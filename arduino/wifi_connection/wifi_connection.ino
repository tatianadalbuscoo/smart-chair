#include <WiFi.h>
#include <time.h>
#include <HTTPClient.h>

// Hotspot
const char* ssidHotspot = "iPhone";
const char* passwordHotspot = "tatianaa";

//To set-up ip address of the server
String serverIPFound = "";

// Analog pins of the 4 pressure sensors
const int fsrPinA0 = A0;  
const int fsrPinA3 = A3;
const int fsrPinA4 = A4;
const int fsrPinA5 = A5;

// Variables where I save the read values
int fsrPinA0Value = 0;
int fsrPinA3Value = 0;
int fsrPinA4Value = 0;
int fsrPinA5Value = 0;

// Chair identifier
const String IDchair = "CHAIR01"; 

String date_time = "";
String posture = "unknown";

unsigned long lastRead = 0;
const unsigned long interval = 1000;


/*  -Initializes serial, Wi-Fi connection and time sync
    - Sets up sensor pins
    - Defines HTTP routes and starts the web server
    parameters: none
    return: void
    */
void setup() {

  // Set Wi-Fi mode to station (client)
  Serial.begin(115200);

  // Start connecting to hotspot
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssidHotspot, passwordHotspot);
  Serial.print("Connecting to HOTSPOT...");

  // Try to connect up to 30 times (approx. 15 seconds)
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  // If connected, print the assigned IP and start the server
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected (HOTSPOT)! IP ESP32: " + WiFi.localIP().toString());
  } 
  else {
    Serial.println("\nFailed to connect to HOTSPOT after 30 attempts!");
  }

  // Configure time synchronization using NTP server
  // Sets timezone to UTC+1 (3600 seconds offset) for Central European Time
  configTime(3600, 0, "pool.ntp.org");
  
  // Setup pin sensori
  pinMode(fsrPinA0, INPUT);
  pinMode(fsrPinA3, INPUT);
  pinMode(fsrPinA4, INPUT);
  pinMode(fsrPinA5, INPUT);

}


/*  Gets the current date and time
      - Formats it as a string "YYYY-MM-DD HH:MM:SS"
    parameters: none
    return: String containing the formatted date and time 
    */
String getDateTime() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);

  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", timeinfo);
  return String(buffer);
}


/*  Builds a JSON string with sensor values, timestamp, and posture that is unknown
    
    parameters: none
    return: String containing the JSON data 
    */
String handleJSON() {
  String json = "{";
  json += "\"id\": \"" + IDchair + "\",";
  json += "\"sensors\": [";
 
  json += "{\"value\": " + String(fsrPinA0Value) + "},";
  json += "{\"value\": " + String(fsrPinA3Value) + "},";
  json += "{\"value\": " + String(fsrPinA4Value) + "},";
  json += "{\"value\": " + String(fsrPinA5Value) + "}";
 
  json += "],";
  json += "\"timestamp\": \"" + date_time + "\",";
  json += "\"posture\": \"" + posture + "\"";
  json += "}";
 
  return json;
}

/*  Sends JSON data to a server via HTTP POST
      - Tries multiple possible server IPs
      - Prints server response or error
    parameters: jsonData (String with JSON payload)
    return: void
    */
void sendDataToServer(String jsonData) {

  // Check if ESP32 is connected to Wi-Fi before attempting to send data
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    if (serverIPFound != "") {
      String serverURL = "http://" + serverIPFound + ":3000/chair";
      Serial.println("Using saved server IP: " + serverURL);

      http.begin(serverURL);
      http.setTimeout(5000);
      http.addHeader("Content-Type", "application/json");

      // Send JSON data via POST and store the HTTP response code
      int httpResponseCode = http.POST(jsonData);
      Serial.print("HTTP Response Code: ");
      Serial.println(httpResponseCode);
      
      // httpResponseCode == 0 → server not reachable (wrong IP, server down, or network issue)
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("Server response: " + response);
      } else {
        Serial.printf("Error sending to %s. Error: %s\n",
                      serverIPFound.c_str(),
                      http.errorToString(httpResponseCode).c_str());
      }

      http.end();
      return; // I don't need to try other IPs if I have a valid one
    }

    // Try multiple possible IP addresses for your server
    // These are common IP addresses for the host in a mobile hotspot network
    String possibleIPs[] = {
      "172.20.10.1",
      "172.20.10.2", 
      "172.20.10.4",
      "192.168.43.1", // Common Android hotspot IP
      "172.20.10.3"   // Try your own ESP32 IP as a last resort
    };
    
    
    // Try each IP until a successful connection is made
    for (int i = 0; i < 5; i++) {
      String serverIP = possibleIPs[i];
      String serverURL = "http://" + serverIP + ":3000/chair";
      
      Serial.print("Trying server at: ");
      Serial.println(serverURL);
      
      // Initialize HTTP connection to the target server URL
      http.begin(serverURL);

      // Increase timeout to 5 seconds
      http.setTimeout(5000);

      // Tell the server we're sending data in JSON format
      http.addHeader("Content-Type", "application/json");

      // Send JSON data via POST and store the HTTP response code
      int httpResponseCode = http.POST(jsonData);
      Serial.print("HTTP Response Code: ");
      Serial.println(httpResponseCode);
      
      // httpResponseCode == 0 → server not reachable (wrong IP, server down, or network issue)
      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("Server response: " + response);
        serverIPFound = serverIP; // Save the successful server IP for future use

        // Close the HTTP connection and free resources
        http.end();
        break;
      } 
      else {
        Serial.printf("Error sending data to %s. Error: %s\n", 
                     serverIP.c_str(), 
                     http.errorToString(httpResponseCode).c_str());
        http.end();
        delay(100);
      }
    }
    
    if (serverIPFound == "") {
      Serial.println("Failed to connect to any server IP. Will try again next cycle.");
    }
  } else {
    Serial.println("WiFi not connected!");
  }
}


/*  - Continuously handles HTTP client requests
    - Reads sensor values at regular intervals
    - Evaluates posture and gets timestamp
    - Sends collected data as JSON to the server
    parameters: none
    return: void
    */
void loop() {

  // Handle incoming HTTP requests
  //server.handleClient(); 
  
  // Read sensors at fixed time intervals
  unsigned long currentMillis = millis();
  if (currentMillis - lastRead >= interval) {
    lastRead = currentMillis;

    fsrPinA0Value = analogRead(fsrPinA0);
    fsrPinA3Value = analogRead(fsrPinA3);
    fsrPinA4Value = analogRead(fsrPinA4);
    fsrPinA5Value = analogRead(fsrPinA5);
   
    // Get current date and time
    date_time = getDateTime();

    // Generate JSON data and send to server
    String json = handleJSON();
    Serial.println("Invio JSON al server: " + json);  // Debug
    sendDataToServer(json);

    //esp_sleep_enable_timer_wakeup(900 * 1000); // in microsecondi
    //esp_light_sleep_start();
  }
}
