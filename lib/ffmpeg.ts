import { Storage, GetSignedUrlConfig } from '@google-cloud/storage';
import ffmpeg from 'fluent-ffmpeg';
import { FfprobeData } from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid'



const MOOD_MUSIC: { [key: string]: string } = {
  'Angry': '[Angry] Drop and Roll - Silent Partner.mp3',
  'Bright': '[Bright] Crimson Fly - Huma-Huma.mp3',
  'Calm': '[Calm] Pachabelly - Huma-Huma.mp3',
  'Dark': '[Dark] Court and Page - Silent Partner.mp3',
  'Funky': '[Funky] Lines - Topher Mohr and Alex Elena.mp3',
  'Happy': '[Happy] Good Starts - Jingle Punks.mp3',
  'Inspirational': '[Inspirational] Grass - Silent Partner.mp3',
  'Romantic': '[Romantic] Ode to Joy - Cooper Cannell.mp3',
  'Sad': '[Sad] Ether - Silent Partner.mp3'
}


/**
 * Transforms a GCS signed URL into a GCS URI (gs://<bucket>/<path>).
 *
 * @param signedUrl The GCS signed URL.
 * @returns The GCS URI or null if the signed URL is invalid.
 */
export function signedUrlToGcsUri(signedUrl: string): string {
  try {
    const url = new URL(signedUrl);
    const pathname = url.pathname;

    // Extract bucket and path from pathname
    const parts = pathname.split('/');
    if (parts.length < 3) {
      return 'error less then 3 parts'; // Invalid pathname format
    }

    const bucket = parts[1];
    const path = parts.slice(2).join('/');

    // Construct GCS URI
    return `gs://${bucket}/${path}`;
  } catch (error) {
    console.error('Error parsing signed URL:', error);
    return 'error';
  }
}

export async function concatenateVideos(gcsVideoUris: string[], speachAudioFiles: string[], withVoiceOver: boolean, mood: string): Promise<any> {
  console.log(`Concatenate all videos`);
  console.log(mood);
  const id = uuidv4();
  const outputFileName = `${id}.mp4`;
  const outputFileNameWithAudio = `${id}_with_audio.mp4`;
  const outputFileNameWithVoiceover = `${id}_with_voiceover.mp4`;
  let finalOutputPath;
  // const storage = new Storage();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-concat-'));
  const concatenationList = path.join(tempDir, 'concat-list.txt');

  try {
    // Download all videos to local temp directory
    console.log(`Download all videos`);
    console.log(gcsVideoUris);
    const localPaths = await Promise.all(
      gcsVideoUris.map(async (signedUri) => {
        // const uri = signedUrlToGcsUri(signedUri);
        // const match = uri.match(/gs:\/\/([^\/]+)\/(.+)/);
        // if (!match) {
        //   throw new Error(`Invalid GCS URI format: ${uri}`);
        // }

        // const [, bucket, filePath] = match;
        const publicDir = path.join(process.cwd(), 'public');
        const localPath = path.join(publicDir, signedUri);
        // const localPath = path.join(tempDir, `video-${index}${path.extname(filePath)}`);

        // await storage
        //   .bucket(bucket)
        //   .file(filePath)
        //   .download({ destination: localPath });

        return localPath;
      })
    );

    // Create concatenation list file
    const fileContent = localPaths
      .map(path => `file '${path}'`)
      .join('\n');
    fs.writeFileSync(concatenationList, fileContent);


    const writtenFileContent = await fs.readFileSync(concatenationList, 'utf8'); // 'utf8' for text files

    // 3. Log the content
    console.log(writtenFileContent);

    // Concatenate videos using FFmpeg
    console.log(`Concatenate videos using FFmpeg`);

    const outputPath = path.join(tempDir, outputFileName);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatenationList)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .output(outputPath)
        .outputOptions('-c copy')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
    finalOutputPath = outputPath;

    const publicDir = path.join(process.cwd(), 'public');
    const audioFile = path.join(publicDir, MOOD_MUSIC[mood]);
    const outputPathWithAudio = path.join(tempDir, outputFileNameWithAudio);
    const outputPathWithVoiceover = path.join(tempDir, outputFileNameWithVoiceover);

    // Adding an audio file
    console.log(`Adding music`);
    await addAudioToVideoWithFadeOut(outputPath, audioFile, outputPathWithAudio)
    finalOutputPath = outputPathWithAudio;

    console.log(withVoiceOver);
    if (withVoiceOver) {
      console.log(`Adding voiceover`);
      console.log(speachAudioFiles.length);
      await addVoiceover(outputPathWithAudio, speachAudioFiles, outputPathWithVoiceover)
      // await createVideoWithVoiceover(outputPathWithAudio, speachAudioFiles, outputPathWithVoiceover)
      finalOutputPath = outputPathWithVoiceover;
    }

    const publicFile = path.join(publicDir, outputFileNameWithVoiceover);
    fs.copyFileSync(finalOutputPath, publicFile);
    // const localVideoName = outputFileNameWithVoiceover;
    // Upload result to GCS
    console.log(`Upload result to GCS`);
    const storage = new Storage();
    const bucket = storage.bucket('svc-demo-vertex-us-publicis');
    await bucket
      .upload(finalOutputPath, {
        destination: outputFileName,
        metadata: {
          contentType: 'video/mp4',
        },
      });
    const file = bucket.file(outputFileName);
    // Generate a signed URL (as explained in the previous response)
    const options: GetSignedUrlConfig = {
      version: 'v4',
      action: 'read', // Change this to the desired action
      expires: Date.now() + 60 * 60 * 1000, // 1 hour expiration
    };
    const [url] = await file.getSignedUrl(options);
    console.log('url:', url);
    return url;
  } finally {
    // Clean up temporary files
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function addAudioToVideoWithFadeOut(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // 1. Get Video Duration using ffprobe
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error('Error getting video metadata:', err);
        reject(err);
        return;
      }

      const videoDuration = metadata.format.duration;
      if (videoDuration === undefined) {
        console.error('Error getting video duration');
        reject(new Error('Could not determine video duration'));
        return;
      }

      // Fade out settings
      const fadeOutDuration = 3; // seconds
      const fadeOutStartTime = videoDuration - fadeOutDuration;

      // Handle very short videos
      // if (fadeOutStartTime < 0) {
      //   console.warn('Video is shorter than the desired fade out duration');
      //   fadeOutStartTime = 0;
      //   fadeOutDuration = videoDuration;
      // }

      // 2. Add Audio to Video with Fade-Out
      ffmpeg(videoPath)
        .input(audioPath)
        .complexFilter([
          `[1:a]afade=t=out:st=${fadeOutStartTime}:d=${fadeOutDuration}[faded_audio]`
        ])
        .outputOptions([
          '-map 0:v',
          '-map [faded_audio]',
          '-c:v copy',
          '-c:a aac',
          '-shortest'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Successfully added audio to video with fade-out!');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error adding audio to video:', err);
          reject(err);
        })
        .run();
    });
  });
}

// async function createVideoWithVoiceover(
//   videoPath: string,
//   voiceoverSegments: string[],
//   outputPath: string
// ): Promise<void> {
//   console.log('createVideoWithVoiceover!!!');
//   return new Promise<void>((resolve, reject) => {


//     // Check directory exists and is writable
//     try {
//       fs.accessSync(path.dirname(outputPath), fs.constants.W_OK);
//     } catch (err) {
//       console.error('Directory not writable:', err);
//     }


//     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-concat-'));
//     const combinedVoiceoverPath = path.join(tmpDir, 'combined_voiceover.mp3');

//     // 1. Concatenate voiceover segments (same as before)
//     const voiceoverListPath = path.join(tmpDir, 'voiceover_list.txt');
//     const voiceoverList = voiceoverSegments.map((segment, index) => {
//       const startTime = index * 8;
//       return `file '${segment}'\noutpoint ${startTime}`;
//     }).join('\n');
//     fs.writeFileSync(voiceoverListPath, voiceoverList);

//     ffmpeg()
//       .input(voiceoverListPath)
//       .inputOptions(['-safe', '0', '-f', 'concat']) 
//       .output(combinedVoiceoverPath)
//       .on('start', (commandLine) => {
//         console.log('FFmpeg command:', commandLine);
//       })
//       .on('end', () => {

//         // 2. Get video duration (needed for amix filter)
//         ffmpeg.ffprobe(videoPath, (err, metadata) => {
//           if (err) {
//             cleanup(tmpDir, voiceoverListPath);
//             return reject(err);
//           }
//           const videoDuration = metadata.format.duration || 0;


//           // 3. Mix with dynamic volume using amix and volume expression
//           ffmpeg(videoPath)
//             .input(combinedVoiceoverPath)
//             .complexFilter([
//               {
//                 filter: 'amix',
//                 options: {
//                   inputs: 2,
//                   duration: 'first',
//                   weights: `if(gte(t,T${voiceoverSegments.length-1}*8),1,0.6) 1`, // Dynamic weight for video audio
//                 },
//                 outputs: 'mixed'
//               }
//             ])

//             .map('0:v') // Video from original input
//             .map('[mixed]') // Audio from mixed output
//             .audioCodec('aac')
//             .videoCodec('copy')
//             .output(outputPath)
//             .outputOptions('-y')  // Force overwrite
//             .outputOptions('-shortest') // Ensure output duration matches the shortest input
//             .on('start', (commandLine) => {
//               console.log('FFmpeg command:', commandLine);
//             })
//             .on('end', () => {
//               cleanup(tmpDir, voiceoverListPath, combinedVoiceoverPath);
//               resolve();
//             })
//             .on('error', (err) => {
//               cleanup(tmpDir, voiceoverListPath, combinedVoiceoverPath);
//               reject(err);
//             })
//             .run();
//         });
//       })
//       .on('error', (err) => {
//         cleanup(tmpDir, voiceoverListPath);
//         reject(err);
//       })
//       .run();

//     function cleanup(tmpDir: string, voiceoverListPath?: string, combinedVoiceoverPath?: string) {
//       if (voiceoverListPath) fs.unlinkSync(voiceoverListPath);
//       if (combinedVoiceoverPath) fs.unlinkSync(combinedVoiceoverPath);
//       fs.rmSync(tmpDir, { recursive: true });
//     }
//   });
// }

async function addVoiceover(
  videoPath: string,
  speechAudioFiles: string[],
  outputPath: string
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    try {
      // 1. Get the duration of the video
      const videoMetadata: FfprobeData = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });
      const videoDuration = videoMetadata.format.duration;

      if (videoDuration === undefined) {
        console.error("Error: Video duration is undefined!");
        reject("Video duration is undefined");
        return;
      }

      const delaySeconds = 8;
      const command = ffmpeg(videoPath);

      // Add voiceover files as inputs
      speechAudioFiles.forEach((file) => {
        command.input(file);
      });

      // Build the complex filter string
      let filter = '';
      const mixInputs: string[] = [];
      const weights: number[] = [];

      // Set the weight for the music (first input)
      weights.push(0.6);

      speechAudioFiles.forEach((_, index) => {
        const delayMs = index * delaySeconds * 1000;
        const streamLabel = `a${index + 1}`;

        // Add adelay filter for each voiceover
        filter += `[${index + 1}:a]adelay=${delayMs}|${delayMs}[${streamLabel}];`;
        mixInputs.push(`[${streamLabel}]`);

        // Set the weight for each voiceover (assuming you want them at full volume)
        weights.push(1);
      });

      // Use the 'weights' option in the amix filter
      filter += `[0:a]${mixInputs.join('')}amix=inputs=${speechAudioFiles.length + 1
        }:duration=first:weights=${weights.join(' ')}[outa]`;

      command
        .complexFilter(filter)
        .outputOptions(['-map 0:v', '-map [outa]'])
        .output(outputPath)
        .audioCodec('aac')
        .videoCodec('copy') // Copy video stream without re-encoding
        .outputOptions('-shortest') // Ensure output duration matches the shortest input
        .on('start', (commandLine) => {
          console.log('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', () => {
          console.log('Merging finished!');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error:', err);
          reject(err);
        })
        .run();
    } catch (err) {
      console.error('Error in addVoiceover:', err);
      reject(err);
    }
  });
}