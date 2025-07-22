import { GetSignedUrlConfig, Storage } from '@google-cloud/storage';
import textToSpeech, { protos } from '@google-cloud/text-to-speech';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const USE_SIGNED_URL = process.env.USE_SIGNED_URL === "true";
const GCS_VIDEOS_STORAGE_URI = process.env.GCS_VIDEOS_STORAGE_URI || '';

const storage = new Storage();

// Assuming you're using Google Cloud Text-to-Speech:
const client = new textToSpeech.TextToSpeechClient();

export async function tts(text: string, language: string): Promise<string> {
  const listVoicesRequest: protos.google.cloud.texttospeech.v1.IListVoicesRequest = {
    languageCode: language,
  };
  const [response] = await client.listVoices(listVoicesRequest);
  let voiceName;
  //find the voice name that contains the voice string
  if (response.voices) {
    // choose the voice with the name that contains Algenib
    voiceName = response.voices.find((voice) => voice.name?.includes('Algenib'))?.name;
    // if no voice is found, choose the voice with the name that contains Charon
    if (!voiceName) {
      voiceName = response.voices.find((voice) => voice.name?.includes('Charon'))?.name;
    }
  } else {
    console.error('No voices found for language:', language);
    throw new Error('No voices found for language');
  }
  console.log(voiceName);
  const request = {
    input: { text },
    voice: {
      languageCode: language,
      name: voiceName,
    },
    audioConfig: {
      audioEncoding: protos.google.cloud.texttospeech.v1.AudioEncoding.MP3
    },
  };

  try {
    const response = await client.synthesizeSpeech(request);
    const audioContent = response[0].audioContent;

    if (!audioContent) {
      console.error("No audio content received from TTS API");
      throw new Error('No audio content received from TTS API');
    }

    // Define the directory where you want to save the audio files
    const publicDir = path.join(process.cwd(), 'public');
    const outputDir = path.join(publicDir, 'tts'); // Example: public/audio

    // Ensure the directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Generate a unique filename, e.g., using a timestamp or a UUID
    const uuid = uuidv4();
    const fileName = `audio-${uuid}.mp3`;

    // Return the relative file path (for serving the file)
    let voiceoverUrl: string;
    if (USE_SIGNED_URL) {
      // Upload video to GCS
      console.log(`Upload result to GCS`);
      const bucketName = GCS_VIDEOS_STORAGE_URI.replace("gs://", "").split("/")[0];
      const destinationPath = path.join(GCS_VIDEOS_STORAGE_URI.replace(`gs://${bucketName}/`, ''), fileName);
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(destinationPath);


      await file.save(audioContent, {
        metadata: {
          contentType: `audio/mpeg`, // Set the correct content type
        }
      });

      // Generate signed URLs
      const options: GetSignedUrlConfig = {
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour expiration
      };

      [voiceoverUrl] = await file.getSignedUrl(options);
    } else {
      const filePath = path.join(outputDir, fileName);
      // Write the audio content to a file
      fs.writeFileSync(filePath, audioContent);
      voiceoverUrl = filePath.split('public/')[1];
    }
    return voiceoverUrl;
  } catch (error) {
    console.error('Error in tts function:', error);
    throw error;
  }
}