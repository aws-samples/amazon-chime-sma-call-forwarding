import boto3
import os
import wave
import argparse
import sys

polly = boto3.client('polly', region_name='us-east-1')

def create_polly (polly_text, file_name):
    response = polly.synthesize_speech(
        OutputFormat='pcm',
        Text = polly_text,
        SampleRate = '16000',
        VoiceId = 'Joanna'
    )    

    if "AudioStream" in response:
        output_wav = '../wav_files/' + file_name + '.wav'
        with wave.open(output_wav, 'wb') as wav_file:
            wav_file.setparams((1, 2, 16000, 0, 'NONE', 'NONE'))
            wav_file.writeframes(response['AudioStream'].read())

    return output_wav

parse_msg = 'Simple utility to create wav files for SMA via Polly'
parser = argparse.ArgumentParser(prog = 'createWav.py', description = parse_msg)
parser.add_argument('-file', help='Name of file to be created (without .wav)')
parser.add_argument('-text', help='Text of the audio to be created in quotes')
args = parser.parse_args()

file_name = args.file
polly_text = args.text

if not file_name:
    print('Filename is required')
    sys.exit()

if not polly_text:
    print('Text is required')
    sys.exit()

wav_file = create_polly(polly_text, file_name)
print('wav file created: ' + wav_file)
