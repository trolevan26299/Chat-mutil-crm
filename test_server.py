from http.server import BaseHTTPRequestHandler, HTTPServer
class S(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        print("WEBHOOK PAYLOAD:")
        print(post_data.decode('utf-8'))
        self.send_response(200)
        self.end_headers()
httpd = HTTPServer(('0.0.0.0', 9999), S)
httpd.serve_forever()
