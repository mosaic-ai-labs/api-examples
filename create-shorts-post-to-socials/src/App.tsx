import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { Toaster } from '@/components/ui/toaster'
import { Loader2, Upload, FolderOpen, Video, RefreshCw } from 'lucide-react'
import axios from 'axios'

// Add Dropbox type
declare global {
  interface Window {
    Dropbox: any
  }
}

// Types
interface VideoFile {
  id: string
  name: string
  source: 'dropbox'
  downloadUrl?: string
  path?: string
}

interface ProcessingStatus {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error'
  progress?: number
  message?: string
  outputUrls?: string[]
}

type ShortType = 'webinar' | 'talking' | 'prompt'

function App() {
  const [selectedVideo, setSelectedVideo] = useState<VideoFile | null>(null)
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({ status: 'idle' })
  const [shortType, setShortType] = useState<ShortType>('webinar')
  const [promptText, setPromptText] = useState('')
  const [dropboxFiles, setDropboxFiles] = useState<VideoFile[]>([])
  const [isLoadingDropboxFiles, setIsLoadingDropboxFiles] = useState(false)
  const [showDropboxFiles, setShowDropboxFiles] = useState(false)
  const { toast } = useToast()

  // Initialize dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  // Load Dropbox files using access token
  const loadDropboxFiles = async () => {
    setIsLoadingDropboxFiles(true)
    setShowDropboxFiles(true)

    const accessToken = import.meta.env.VITE_DROPBOX_ACCESS_TOKEN

    if (!accessToken) {
      toast({
        title: "Configuration Error",
        description: "Add VITE_DROPBOX_ACCESS_TOKEN to .env.local",
        variant: "destructive"
      })
      setIsLoadingDropboxFiles(false)
      return
    }

    try {
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.wmv', '.flv']
      const allVideoFiles: VideoFile[] = []

      // Function to recursively list files
      const listFolderRecursive = async (path: string = '') => {
        let hasMore = true
        let cursor = undefined

        while (hasMore) {
          const response: any = await axios.post(
            cursor ? 'https://api.dropboxapi.com/2/files/list_folder/continue' : 'https://api.dropboxapi.com/2/files/list_folder',
            cursor ? { cursor } : {
              path: path,
              recursive: true,
              include_media_info: true
            },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )

          // Filter for video files
          const videoFiles = response.data.entries.filter((entry: any) => 
            entry['.tag'] === 'file' && 
            videoExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
          )

          // Add to our collection
          videoFiles.forEach((file: any) => {
            allVideoFiles.push({
              id: file.id,
              name: file.path_display || file.name, // Show full path
              source: 'dropbox' as const,
              downloadUrl: file.id, // Store the file ID, we'll use path_lower when downloading
              path: file.path_lower // Store the actual path for downloading
            })
          })

          hasMore = response.data.has_more
          cursor = response.data.cursor
        }
      }

      // Start recursive listing from root
      await listFolderRecursive('')

      setDropboxFiles(allVideoFiles)

      if (allVideoFiles.length === 0) {
        toast({
          title: "No Videos Found",
          description: "No video files found in your Dropbox",
        })
      } else {
        toast({
          title: "Videos Found",
          description: `Found ${allVideoFiles.length} video${allVideoFiles.length > 1 ? 's' : ''} in your Dropbox`,
        })
      }
    } catch (error: any) {
      console.error('Error loading Dropbox files:', error)
      toast({
        title: "Error",
        description: error.response?.data?.error_summary || "Failed to load Dropbox files",
        variant: "destructive"
      })
    } finally {
      setIsLoadingDropboxFiles(false)
    }
  }

  // Select a Dropbox file
  const selectDropboxFile = (file: VideoFile) => {
    setSelectedVideo(file)
    setShowDropboxFiles(false)
  }

  // Process video through Mosaic
  const processVideo = async () => {
    if (!selectedVideo) return

    setProcessingStatus({ status: 'uploading', message: 'Uploading video to Mosaic...' })

    try {
      let videoBlob: Blob
      
      // Dropbox download using access token
      const accessToken = import.meta.env.VITE_DROPBOX_ACCESS_TOKEN
      
      // Find the full file info from our stored list
      const dropboxFile = dropboxFiles.find(f => f.id === selectedVideo.id)
      if (!dropboxFile) {
        toast({
          title: "Error",
          description: "File information not found",
          variant: "destructive"
        })
        setProcessingStatus({ status: 'idle' })
        return
      }

      // Extract the path from the stored data
      const filePath = dropboxFile.path || dropboxFile.name
      console.log('Downloading Dropbox file:', filePath)
      
      try {
        // Use native fetch instead of axios to avoid Content-Type issues
        const response = await fetch('https://content.dropboxapi.com/2/files/download', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Dropbox-API-Arg': JSON.stringify({ path: filePath })
          }
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          console.error('Dropbox error details:', errorText)
          throw new Error(errorText || 'Failed to download from Dropbox')
        }
        
        videoBlob = await response.blob()
      } catch (error: any) {
        console.error('Dropbox download error:', error)
        
        toast({
          title: "Download Error",
          description: error.message || "Failed to download from Dropbox",
          variant: "destructive"
        })
        setProcessingStatus({ status: 'idle' })
        return
      }

      // Get file size
      const fileSize = videoBlob.size

      // Step 1: Get upload URL from Mosaic
      const uploadUrlResponse = await axios.post(
        `${import.meta.env.VITE_MOSAIC_API_BASE}/video/get-upload-url`,
        {
          filename: selectedVideo.name,
          file_size: fileSize,
          content_type: 'video/mp4'
        },
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_MOSAIC_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const { upload_url, video_id } = uploadUrlResponse.data

      // Step 2: Upload to Mosaic
      await axios.put(upload_url, videoBlob, {
        headers: { 'Content-Type': 'video/mp4' }
      })

      // Step 3: Finalize upload
      const finalizeResponse = await axios.post(
        `${import.meta.env.VITE_MOSAIC_API_BASE}/video/finalize-upload/${video_id}`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_MOSAIC_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const fileId = finalizeResponse.data.file_uuid

      // Step 4: Run agent with prompt OR agent id
      setProcessingStatus({ status: 'processing', message: 'Creating your short video...' })

      let agentId: string | null = null
      let prompt: string | null = null
      let auto = false

      if (shortType === 'webinar') {
        agentId = import.meta.env.VITE_WEBINAR_AGENT_ID
      } else if (shortType === 'talking') {
        agentId = import.meta.env.VITE_TALKINGHEAD_AGENT_ID
      } else {
        prompt = promptText || 'make this an interesting short, add captions, and add in some background ai music'
        auto = true
      }

      const runResponse = await axios.post(
        `${import.meta.env.VITE_MOSAIC_API_BASE}/run-agent`,
        {
          file_id: fileId,
          agent_id: agentId,
          prompt,
          auto
        },
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_MOSAIC_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      )

      const runId = runResponse.data.agent_run_id

      // Step 5: Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await axios.get(
            `${import.meta.env.VITE_MOSAIC_API_BASE}/get-agent-run-simple/${runId}`,
            {
              headers: {
                'Authorization': `Bearer ${import.meta.env.VITE_MOSAIC_API_KEY}`
              }
            }
          )

          const { status, progress } = statusResponse.data

          if (status === 'success') {
            clearInterval(pollInterval)
            
            // Get output URLs
            const outputsResponse = await axios.get(
              `${import.meta.env.VITE_MOSAIC_API_BASE}/get-agent-run-outputs/${runId}`,
              {
                headers: {
                  'Authorization': `Bearer ${import.meta.env.VITE_MOSAIC_API_KEY}`
                }
              }
            )

            const outputUrls = (outputsResponse.data.outputs || [])
              .map((o: any) => o.download_url)
              .filter(Boolean)

            setProcessingStatus({
              status: 'completed',
              message: 'Video processed successfully!',
              outputUrls
            })
          } else if (status === 'failed') {
            clearInterval(pollInterval)
            setProcessingStatus({
              status: 'error',
              message: 'Processing failed. Please try again.'
            })
          } else {
            setProcessingStatus({
              status: 'processing',
              message: `Processing... ${progress || 0}%`,
              progress
            })
          }
        } catch (error) {
          clearInterval(pollInterval)
          console.error('Polling error:', error)
        }
      }, 5000)

    } catch (error) {
      console.error('Processing error:', error)
      setProcessingStatus({
        status: 'error',
        message: 'An error occurred during processing'
      })
      toast({
        title: "Processing Error",
        description: "Failed to process video. Please try again.",
        variant: "destructive"
      })
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">Create & Post Social Shorts</h1>
          <p className="text-muted-foreground">Transform your videos into engaging social media content</p>
        </div>

        {/* Step 1: Select Video */}
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Select a Video</CardTitle>
            <CardDescription>Choose a video from Dropbox</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <Button onClick={loadDropboxFiles} variant="outline" className="h-24">
                <FolderOpen className="mr-2 h-5 w-5" />
                Dropbox
              </Button>
            </div>
            
            {/* Dropbox file list */}
            {showDropboxFiles && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Select a video from Dropbox</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={loadDropboxFiles}
                    disabled={isLoadingDropboxFiles}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoadingDropboxFiles ? 'animate-spin' : ''}`} />
                  </Button>
                </CardHeader>
                <CardContent>
                  {isLoadingDropboxFiles ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dropboxFiles.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No video files found
                        </p>
                      ) : (
                        dropboxFiles.map((file) => (
                          <Button
                            key={file.id}
                            variant="ghost"
                            className="w-full justify-start"
                            onClick={() => selectDropboxFile(file)}
                          >
                            <Video className="mr-2 h-4 w-4" />
                            <span className="flex-1 text-left">{file.name}</span>
                          </Button>
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            {selectedVideo && (
              <div className="flex items-center space-x-2 p-4 bg-secondary rounded-lg">
                <Video className="h-5 w-5" />
                <span className="flex-1">{selectedVideo.name}</span>
                <span className="text-sm text-muted-foreground">{selectedVideo.source}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Process Video */}
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Process Video</CardTitle>
            <CardDescription>Transform your video into a social media short with AI</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Short Type Selection */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm">Choose Short Type</Label>
              <div className="flex items-center space-x-2">
                <Button size="sm" variant={shortType==='webinar'?'default':'outline'} onClick={()=>setShortType('webinar')}>Webinar</Button>
                <Button size="sm" variant={shortType==='talking'?'default':'outline'} onClick={()=>setShortType('talking')}>Talking Head</Button>
                <Button size="sm" variant={shortType==='prompt'?'default':'outline'} onClick={()=>setShortType('prompt')}>Prompt</Button>
              </div>
              {shortType==='prompt' && (
                <Textarea
                  placeholder="Enter your custom prompt..."
                  value={promptText}
                  onChange={(e)=>setPromptText(e.target.value)}
                  rows={3}
                  className="mt-2"
                />
              )}
            </div>

            <Button 
              onClick={processVideo} 
              disabled={!selectedVideo || processingStatus.status !== 'idle'}
              className="w-full"
            >
              {processingStatus.status === 'uploading' && (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              )}
              {processingStatus.status === 'processing' && (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing... {processingStatus.progress}%
                </>
              )}
              {processingStatus.status === 'idle' && (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Process Video
                </>
              )}
              {processingStatus.status === 'completed' && 'Video Processed!'}
              {processingStatus.status === 'error' && 'Try Again'}
            </Button>
            
            {processingStatus.message && (
              <p className="mt-2 text-sm text-muted-foreground text-center">
                {processingStatus.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Preview & Download */}
        {processingStatus.status === 'completed' && (processingStatus.outputUrls?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Preview & Download</CardTitle>
              <CardDescription>Preview your processed video and download it</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {processingStatus.outputUrls?.map((url, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden">
                    <video src={url} controls className="w-full h-full" />
                  </div>
                  <Button asChild variant="secondary" className="w-full">
                    <a href={url} download>
                      Download Output {idx + 1}
                    </a>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
      
      <Toaster />
    </div>
  )
}

export default App
