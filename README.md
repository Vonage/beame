# Beame

This action will transfer your file-system across jobs. Just choose whether you'd like to beam "_up_" or "_down_".

## Description

Beame uses Github Actions Artifacts to persist portions of your file system. It defaults to the entirety of your work folder (`${{ github.workspace }}`), which is usually very helpful, but it can also be easily customized.

Unlike [Github's artifact toolkit](https://github.com/actions/toolkit/tree/main/packages/artifact), Beame _compresses_ and _streams_ your files, which substantially reduces up/down times.

_note_: The artifacts created by "beame" are not designed to be consumed directly (which the use of this action).

## Inputs

## `direction`

Either:

* **`up`** - To upload files from your current job's filesystem
* **`down`** - To download files to your current job's filesystem

**Default**: `up`

## `folder`

The folder from which to read files upon beaming "up" _or_ to which to write files to when beaming "down".

**Default**: `${{ github.workspace }}`

## `pattern`

The glob pattern to be used when beaming "up". Relative to `folder`.

**Default**: `**` (all files)

## `artifact`

The name of the Github Actions artifact. `down` beams should use the same `artifact` name as their counterpart `up` beams.

**Default**: `beam_me_artifact`

## Example usage
```yaml
on: [push]

jobs:
  upload:
  runs-on: ubuntu-latest
  name: Upload
  steps:
  - uses: actions/setup-node@v2
    with:
      node-version: '14'
  - uses: actions/checkout@v2
  - run: npm i
  - run: echo "Hello World" > hello.txt
  - name: This will beame the working folder up
    uses: Vonage/beame@main

download:
needs: upload
runs-on: ubuntu-latest
name: Download
steps:
  - name: This will beame the working folder down
    uses: Vonage/beame@main
    with:
     direction: "down"
  - run: ls -al
```


