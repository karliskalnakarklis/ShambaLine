from flask import Flask, request, jsonify, render_template_string, send_file
from flask_cors import CORS
from groq import Groq
from gtts import gTTS
import requests
import re
import io
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.environ["GROQ_API_KEY"])

SYSTEM_PROMPT = {
    "role": "system",
    "content": """
You are an AI voice assistant for farmers in East Africa.
Keep talking in English.
Be straight forward and simple.
BE PROACTIVE - ASK QUESTIONS, DON'T RAMBLE.

Farmers ask about:
- crops
- livestock
- weather

HOW TO RESPOND:
1. If the farmer asks a question and you need more information - ASK CLARIFYING QUESTIONS.
2. Only give advice after you understand their situation.
3. Do not give general advice. Ask specific questions first:
   - "How big is your farm?"
   - "What tools do you have?"
   - "When did this start happening?"
   - "What did you already try?"
   - "Are you close to a town or far from shops?"
   - "Is this the rainy season or dry season now?"
4. After asking, STOP and wait for their answer.
5. Then give short, practical advice based on what they told you.
6. Do not continue talking after you ask a question.

Rules:
Always use WEATHER DATA when available.
Give short practical farming advice.
Maximum 4 sentences.
Dont use brackets.
Dont say check the weather forecast.
Dont use the word showers.
NEVER GIVE LONG EXPLANATIONS - ask if you need more info, then give short answer.

LANGUAGE - VERY IMPORTANT:
DO NOT use technical or scientific terms. Ever.
- Never say "tetanus" - say "sickness where the animal gets stiff and cannot move"
- Never say "pneumonia" - say "sickness where breathing is hard"
- Never say "compost" - say "rot dead leaves and animal waste"
- Never say "fungal infection" - say "when something grows on the animal"
- Never say "dehydration" - say "when the animal does not have enough water"
- Never say "nitrogen" - say "food for plants in the soil"
- Never say "pH" or "acidic" - describe soil by how it feels and looks
Use words a farmer who cannot read would understand.
Explain like you are talking to someone's grandmother.

Important:
Remember many farmers in East Africa have limited resources.
Regional relevance and common diseases
Always consider the typical crops, livestock, pests, and diseases found in East Africa. Focus on problems that commonly occur in the region. Avoid mentioning rare diseases or conditions that are unlikely in this environment.
Do not suggest expensive products or things that require going to a store.
Prefer solutions that use locally available materials, traditional methods, or simple tools.
Be creative if needed.
Always consider local conditions such as climate, soil type, seasonal rains, and common pests or diseases.
Use practical methods that farmers can implement with what they have: natural repellents, compost, crop rotation, simple barriers, or basic irrigation tools.
Advice should be actionable immediately and realistic for small-scale farms.
Keep solutions safe for both crops and livestock, avoiding harmful chemicals when possible.
Focus on preserving yield, reducing loss, and maintaining healthy animals using everyday materials.
Water availability: Advice must consider periods of drought or limited access to irrigation.
Seasonality: Crop and livestock guidance should be aligned with local seasons and rainfall patterns.
Simple language: Use short, clear sentences; avoid technical terms unless they are widely known.
Safety: Food safety and animal welfare must always be prioritized; avoid advice that is toxic or dangerous.
Access to technology: Advice must take into account limited availability of modern tools, machinery, or electronic devices.
Budget-conscious: Avoid suggestions that require money or expensive equipment.
"""
}

messages = [SYSTEM_PROMPT]
transcript = []  # [{role, text, time}]


def log(role, text):
    transcript.append({
        "role": role,
        "text": text,
        "time": datetime.now().strftime("%H:%M:%S")
    })


def extract_city(text):
    match = re.search(r"in ([a-zA-Z\s]+)", text.lower())
    if match:
        return match.group(1).strip()
    return None


def get_coordinates(city):
    url = f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1"
    data = requests.get(url).json()
    if "results" not in data:
        return None, None
    lat = data["results"][0]["latitude"]
    lon = data["results"][0]["longitude"]
    return lat, lon


def get_weather(city):
    lat, lon = get_coordinates(city)
    if lat is None:
        return None

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,precipitation"
        f"&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
        f"&timezone=auto"
    )
    data = requests.get(url).json()

    current_temp = data["current"]["temperature_2m"]
    current_rain = data["current"]["precipitation"]
    day2_max = data["daily"]["temperature_2m_max"][2]
    day2_min = data["daily"]["temperature_2m_min"][2]
    day2_rain = data["daily"]["precipitation_sum"][2]

    return f"""
REAL TIME WEATHER DATA FOR {city.upper()}:
Current temperature: {current_temp}°C
Current rain: {current_rain} mm
Forecast in 2 days: Max {day2_max}°C / Min {day2_min}°C, Rain {day2_rain} mm
"""


DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ShambaLine — Live Conversation</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #f5f0e8;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  header {
    background: #2d7a3a;
    padding: 20px 32px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header h1 { color: white; font-size: 22px; font-weight: 600; }
  #status-bar {
    background: #1e5c28;
    padding: 8px 32px;
    font-size: 13px;
    color: rgba(255,255,255,0.85);
  }
  #status-bar span { display: inline-block; }
  #status-bar .dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #4ade80;
    margin-right: 8px;
    animation: blink 1.5s infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  #messages {
    flex: 1;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 800px;
    width: 100%;
    margin: 0 auto;
  }
  .empty {
    text-align: center;
    color: #9a8f80;
    margin-top: 80px;
    font-size: 16px;
  }
  .msg {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .msg.farmer { align-items: flex-end; }
  .msg.ai { align-items: flex-start; }
  .label {
    font-size: 11px;
    color: #9a8f80;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .bubble {
    padding: 12px 16px;
    border-radius: 16px;
    font-size: 16px;
    line-height: 1.5;
    max-width: 85%;
  }
  .farmer .bubble {
    background: #2d7a3a;
    color: white;
    border-bottom-right-radius: 4px;
  }
  .ai .bubble {
    background: white;
    color: #1a1a1a;
    border-bottom-left-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .time {
    font-size: 11px;
    color: #b5a899;
  }
</style>
</head>
<body>
<header>
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
  </svg>
  <h1>ShambaLine — Live Conversation</h1>
</header>
<div id="status-bar">
  <span class="dot"></span><span id="status-text">Waiting for call...</span>
</div>
<div id="messages">
  <p class="empty" id="empty-msg">No conversation yet. Start a call on the phone.</p>
</div>
<script>
  let lastCount = 0;

  async function poll() {
    try {
      const res = await fetch('/api/messages');
      const msgs = await res.json();

      if (msgs.length !== lastCount) {
        lastCount = msgs.length;
        const container = document.getElementById('messages');
        document.getElementById('empty-msg')?.remove();

        // Only add new messages
        const existing = container.querySelectorAll('.msg').length;
        for (let i = existing; i < msgs.length; i++) {
          const m = msgs[i];
          const div = document.createElement('div');
          div.className = 'msg ' + (m.role === 'user' ? 'farmer' : 'ai');
          div.innerHTML =
            '<span class="label">' + (m.role === 'user' ? 'Farmer' : 'ShambaLine AI') + '</span>' +
            '<div class="bubble">' + m.text + '</div>' +
            '<span class="time">' + m.time + '</span>';
          container.appendChild(div);
        }
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }

      // Update status
      const statusEl = document.getElementById('status-text');
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        statusEl.textContent = last.role === 'user' ? 'Farmer is speaking...' : 'AI responded — listening for next question';
      }
    } catch (e) {
      document.getElementById('status-text').textContent = 'Flask server not reachable';
    }
  }

  setInterval(poll, 1000);
  poll();
</script>
</body>
</html>
"""


@app.route("/")
def dashboard():
    return render_template_string(DASHBOARD_HTML)


@app.route("/api/messages", methods=["GET"])
def get_messages():
    return jsonify(transcript)


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file"}), 400

    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    filename = audio_file.filename or "recording.mp4"
    content_type = audio_file.content_type or "audio/mp4"

    transcription = client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=(filename, audio_bytes, content_type),
    )

    return jsonify({"text": transcription.text})


@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_text = data.get("text", "")

    if not user_text:
        return jsonify({"reply": "I didn't catch that. Could you repeat?"}), 400

    log("user", user_text)

    if any(w in user_text.lower() for w in ["weather", "rain", "temperature", "forecast"]):
        city = extract_city(user_text)
        if city:
            weather_data = get_weather(city)
            if weather_data:
                messages.append({"role": "system", "content": weather_data})

    messages.append({"role": "user", "content": user_text})

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=messages
    )

    ai_text = response.choices[0].message.content.strip()
    messages.append({"role": "assistant", "content": ai_text})

    log("assistant", ai_text)

    return jsonify({"reply": ai_text})


@app.route("/api/tts", methods=["POST"])
def tts():
    data = request.get_json()
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "No text"}), 400

    # tld="co.za" gives South African English — closest available to East African accent
    tts_obj = gTTS(text=text, lang="en", tld="co.za")
    fp = io.BytesIO()
    tts_obj.write_to_fp(fp)
    fp.seek(0)
    return send_file(fp, mimetype="audio/mpeg")


@app.route("/api/start", methods=["POST"])
def start():
    global messages, transcript
    messages = [SYSTEM_PROMPT]
    transcript = []
    greeting = "Welcome to ShambaLine! How can I help you with your farm today?"
    log("assistant", greeting)
    return jsonify({"greeting": greeting})


@app.route("/api/reset", methods=["POST"])
def reset():
    global messages, transcript
    messages = [SYSTEM_PROMPT]
    transcript = []
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    print("ShambaLine Flask server starting on port 5001...")
    print("Dashboard: http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True)
