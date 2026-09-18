import AppKit
import WebKit

// 实验宿主：真正的 WKWebView/JS 消息桥。HTTP 仅承载本机测试资源。
final class Harness: NSObject, WKNavigationDelegate, WKScriptMessageHandlerWithReply {
    let origin: URL
    let output: URL
    let replay: URL
    let diagnostics = ProcessInfo.processInfo.environment["PLIFLO_DIAGNOSTICS"] != "0"
    var view: WKWebView!
    var pageCount = 0
    var started = Date()
    var pageStats: [[String: Any]] = []
    init(origin: URL, output: URL, replay: URL) {
        self.origin=origin; self.output=output; self.replay=replay
        super.init()
        let config=WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "page")
        view=WKWebView(frame:NSRect(x:0,y:0,width:1200,height:900),configuration:config)
        view.navigationDelegate=self
    }
    func finish(_ error: String) {
        fputs(error+"\n",stderr)
        // 只清理当前宿主独占创建的目录，诊断模式保留失败证据。
        if !diagnostics { try? FileManager.default.removeItem(at:output) }
        exit(1)
    }
    // 后端等待不依赖主线程 RunLoop，避免同步等待时主线程超时计时器失效。
    func replayPDF(_ input: URL, _ target: URL) throws {
        let process=Process(); process.executableURL=replay
        process.arguments=[input.path,target.path]
        let completed=DispatchSemaphore(value:0)
        process.terminationHandler={_ in completed.signal()}
        try process.run()
        if completed.wait(timeout:.now()+30) == .timedOut {
            process.terminate()
            if completed.wait(timeout:.now()+2) == .timedOut {
                kill(process.processIdentifier,SIGKILL)
                process.waitUntilExit()
            }
            throw NSError(domain:"PDF backend timeout",code:1)
        }
        guard process.terminationStatus==0 else {throw NSError(domain:"PDF backend failed",code:Int(process.terminationStatus))}
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard var body=message.body as? [String:Any], let index=body["index"] as? Int, index==pageCount else {replyHandler(nil,"Invalid page message");return}
        let reference=body.removeValue(forKey:"reference") as? String
        let png=reference.flatMap {Data(base64Encoded:$0)}
        guard (!diagnostics || png != nil), let data=try? JSONSerialization.data(withJSONObject:body) else {replyHandler(nil,"Invalid page recording");return}
        let prefix=output.appendingPathComponent(String(format:"page-%03d",index+1))
        let start=Date()
        DispatchQueue.global().async {
            do {
                try data.write(to:prefix.appendingPathExtension("json"),options:.atomic)
                if self.diagnostics {
                try png!.write(to:prefix.appendingPathExtension("png"),options:.atomic)
                try self.replayPDF(prefix.appendingPathExtension("json"),prefix.appendingPathExtension("pdf"))
                }
                DispatchQueue.main.async {
                    self.pageCount+=1
                    self.pageStats.append(["index":index,"commandBytes":data.count,"referenceBytes":png?.count ?? 0,"spoolAndReplayMs":Date().timeIntervalSince(start)*1000])
                    replyHandler(["index":index],nil)
                }
            } catch { DispatchQueue.main.async {replyHandler(nil,error.localizedDescription)} }
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("const deadline=Date.now()+10000; while (typeof window.runBridge !== 'function') { if (Date.now()>=deadline) throw new Error('Browser bundle initialization failed'); await new Promise(r=>setTimeout(r,20)); } return await window.runBridge({allPages:true,native:true,diagnostics:diagnostics});",arguments:["diagnostics":diagnostics],in:nil,in:.page) { result in
            do {
                let value=try result.get()
                guard let summary=value as? [String:Any],let expected=summary["sourcePages"] as? Int,expected==self.pageCount else {self.finish("Incomplete page stream");return}
                // 诊断时保留逐页 PDF；最终文件由一个 Cairo surface 顺序读取页文件输出。
                let manifest=self.output.appendingPathComponent("manifest.json")
                let paths=(0..<self.pageCount).map {self.output.appendingPathComponent(String(format:"page-%03d.json",$0+1)).path}
                try JSONSerialization.data(withJSONObject:["pages":paths]).write(to:manifest,options:.atomic)
                try self.replayPDF(manifest,self.output.appendingPathComponent("document.pdf"))
                if !self.diagnostics {
                    for path in paths {try FileManager.default.removeItem(atPath:path)}
                    try FileManager.default.removeItem(at:manifest)
                }
                var report=summary
                report["engine"]="WKWebView";report["wallMs"]=Date().timeIntervalSince(self.started)*1000
                report["pageStats"]=self.pageStats
                report["diagnostics"]=self.diagnostics
                let data=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys])
                try data.write(to:self.output.appendingPathComponent("result.json"),options:.atomic)
                print(String(data:data,encoding:.utf8)!);exit(0)
            } catch {self.finish(error.localizedDescription)}
        }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {finish(error.localizedDescription)}
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {finish("Web content process terminated")}
}
guard CommandLine.arguments.count==4,let url=URL(string:CommandLine.arguments[1]),url.host=="127.0.0.1" else {fatalError("Usage: wk-harness localhost-url new-output-directory replay-path")}
let output=URL(fileURLWithPath:CommandLine.arguments[2],isDirectory:true)
guard !FileManager.default.fileExists(atPath:output.path) else {fatalError("Output directory already exists")}
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
let app=NSApplication.shared
app.setActivationPolicy(.prohibited)
let harness=Harness(origin:url,output:output,replay:URL(fileURLWithPath:CommandLine.arguments[3]))
DispatchQueue.main.asyncAfter(deadline:.now()+120){harness.finish("WK harness timeout")}
harness.view.load(URLRequest(url:url))
app.run()
