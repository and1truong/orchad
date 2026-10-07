import {test,expect,type Page} from "@playwright/test";
async function login(page:Page,id:string){
 await page.goto("/");await page.getByLabel("Account",{exact:true}).fill(id);
 await page.getByLabel("Password",{exact:true}).fill(id+"-dev");await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByRole("button",{name:"Sign out",exact:true})).toBeVisible();
}
test("human uploads original timed captions, reads native cues and opens transcript with the keyboard",async({page})=>{
 await login(page,"editor");await page.getByRole("button",{name:"Administration",exact:true}).click();
 const library=page.getByRole("region",{name:"Reusable content library",exact:true});
 await library.getByRole("button",{name:"New item",exact:true}).click();
 await library.getByLabel("Item ID",{exact:true}).fill("caption-browser");
 await library.getByLabel("Item title",{exact:true}).fill("Original captioned audio");
 await library.getByLabel("Item summary",{exact:true}).fill("Self-authored accessibility fixture");
 await library.getByLabel("Item text",{exact:true}).fill("Review original timed text");
 await library.getByLabel("Item format",{exact:true}).selectOption("audio");
 await library.getByLabel("Item transcript",{exact:true}).fill("Original audio description");
 const wav=Buffer.alloc(8044);wav.write("RIFF",0);wav.writeUInt32LE(8036,4);wav.write("WAVEfmt ",8);
 wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);
 wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(8000,40);
 await library.getByLabel("I own this content and may upload it",{exact:true}).check();
 await library.getByLabel("Content file",{exact:true}).setInputFiles({name:"original.wav",mimeType:"audio/wav",buffer:wav});
 await expect(library.getByRole("status")).toContainText("Stored original.wav");
 await library.getByText("Add or review caption tracks",{exact:true}).click();
 const captions=library.getByRole("group",{name:"Caption authoring",exact:true});
 await captions.getByLabel("I own this content and may upload it",{exact:true}).check();
 await captions.getByLabel("Content file",{exact:true}).setInputFiles({name:"original.vtt",mimeType:"text/vtt",
  buffer:Buffer.from("WEBVTT\n\n00:00.000 --> 00:00.500\nOriginal timed caption\n")});
 await expect(captions.getByRole("status")).toContainText("Stored original.vtt");
 await library.getByRole("button",{name:"Save item draft",exact:true}).click();
 const row=library.locator(".learning-row").filter({has:page.getByRole("heading",{name:"Original captioned audio",exact:true})});
 await row.getByRole("button",{name:"Publish item",exact:true}).click();await expect(row).toContainText("Published version 1");
 await page.getByRole("button",{name:"Sign out",exact:true}).click();await login(page,"learner-a");
 const source=page.locator(".learning-row").filter({has:page.getByRole("heading",{name:"Original captioned audio",exact:true})});
 await source.getByRole("button",{name:/Read/}).click();
 const reader=page.getByRole("region",{name:"Standalone item reader",exact:true}),audio=reader.locator("audio");
 await expect(audio).toHaveAttribute("src",/^blob:/);
 await expect.poll(()=>audio.evaluate((el:HTMLAudioElement)=>el.textTracks[0]?.cues?.length??0)).toBe(1);
 expect(await audio.evaluate((el:HTMLAudioElement)=>(el.textTracks[0]!.cues![0] as VTTCue).text)).toBe("Original timed caption");
 const summary=reader.locator("summary").filter({hasText:"Caption transcript · English captions"});
 await summary.focus();await expect(summary).toBeFocused();await page.keyboard.press("Enter");
 await expect(reader.getByText("Original timed caption",{exact:true})).toBeVisible();
 await expect(reader).toContainText("No course progress or certificate");
 await page.screenshot({path:"artifacts/captions-keyboard-transcript.png",fullPage:true});
});
