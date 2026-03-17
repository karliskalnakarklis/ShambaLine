import pyttsx3


def list_available_voices():
    engine = pyttsx3.init()
    voices = engine.getProperty('voices')

    print("Beschikbare stemmen:")
    for i, voice in enumerate(voices):
        print(f"\nStem {i}:")
        print(f"  ID: {voice.id}")
        print(f"  Naam: {voice.name}")
        print(f"  Taal: {voice.languages}")

        # Test elke stem
        engine.setProperty('voice', voice.id)
        engine.say(f"Dit is stem nummer {i}")
        engine.runAndWait()

    engine.stop()


if (__name__== "__main__"):
    list_available_voices()