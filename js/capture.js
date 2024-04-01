function capture() {
    var canvas = document.getElementById("canvas");
    var video = document.querySelector("myvideo");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas
      .getContext("2d")
      .drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
  
    /** Code to merge image **/
    /** For instance, if I want to merge a play image on center of existing image **/
    const playImage = new Image();
    playImage.src = "path to image asset";
    playImage.onload = () => {
      const startX = video.videoWidth / 2 - playImage.width / 2;
      const startY = video.videoHeight / 2 - playImage.height / 2;
      canvas
        .getContext("2d")
        .drawImage(playImage, startX, startY, playImage.width, playImage.height);
      canvas.toBlob() = (blob) => {
        const img = new Image();
        img.src = window.URL.createObjectUrl(blob);
      };
    };
    /** End **/
  }