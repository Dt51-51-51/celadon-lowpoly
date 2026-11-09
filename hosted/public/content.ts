// Public landing copy. Plain data only: the public build must not import catalog, recipe or preview modules.
export type Step={title:string;body:string};
export type Faq={question:string;answer:string;links?:Array<[string,string]>};

export const hero={
 eyebrow:'Open source · Built by its community',
 title:'Free 3D models anyone can',
 words:['reshape','recolor','improve','remix'],
 lead:'Open source. Every model is a recipe: a small open-source program with named controls. Turn its knobs here, in your engine or with your coding agent. Browse and download without an account.',
};

export const repository={
 home:'https://github.com/Dt51-51/celadon-lowpoly',
 contributing:'https://github.com/Dt51-51/celadon-lowpoly/blob/main/CONTRIBUTING.md',
 engine:'https://github.com/Dt51-51/celadon-lowpoly/tree/main/src/engine',
 api:'https://api.github.com/repos/Dt51-51/celadon-lowpoly',
};

export const rabbitCompare={
 image:'/brand/rabbit-engine-compare.png',
 alt:'Rabbit sculpt comparison, three-quarter and side.',
 eyebrow:'In progress',
 title:'I am improving the engine.',
 lead:'The rabbit is how the generator is checked. The sculpt engine builds it as one closed mesh: body, legs, ears and tail share one surface.',
 note:'The shape is closer. The ears, eyes, mouth and tail still need work. If you can make the generator better, please help. One pull request improves every model that uses it.',
};

export const engineLoop:Step[]=[
 {title:'Improve the engine',body:'Anyone can make the shared generator better: smoother roofs, better timber, new parts.'},
 {title:'Open a pull request',body:'Changes land through public review on GitHub, with renders before and after.'},
 {title:'Every model gets better',body:'Recipe models rebuild from the new engine, so one fix improves the whole catalog.'},
 {title:'New models arrive',body:'Better parts make better recipes. Members submit them and people review each one.'},
];

export const pillars:Step[]=[
 {title:'Recipes, not frozen meshes',body:'Each model is code with named controls for size, construction, parts and colours. Change a value and the model rebuilds. The default design reproduces the published model exactly.'},
 {title:'Made for your own agent',body:'One open-source bundle gives Codex, Claude Code, Cursor or any coding agent the engine and the skill. It builds, checks and exports locally. No Celadon Lowpoly account, API key or paid service needed.'},
 {title:'Community-made, human-reviewed',body:'Anyone can sign up and contribute. An independent human reviewer checks every model before it is published. Published models keep their source, licence and review record.'},
];

export const howItWorks:Step[]=[
 {title:'1. Give your agent the toolkit',body:'Download the single toolkit archive from the docs page. Your agent installs the project skill and the local engine in your project.'},
 {title:'2. Ask for a model',body:'Describe what you need. The agent picks or writes a recipe, sets its controls and renders previews to check the result.'},
 {title:'3. Edit it as a design',body:'Shape, parts and colours are saved as a small design file next to the recipe, so you can change them again later instead of starting over.'},
 {title:'4. Export to your engine',body:'Get GLB, OBJ + MTL, FBX or USDZ for Unity, Godot, Unreal, Blender, three.js or Apple Quick Look, in meters with +Y up, together with a controls file, the editable design, the recipe source and the licence notices.'},
];

export const contribute:Step[]=[
 {title:'Make it locally',body:'Start from a preset of an existing recipe or write an original recipe with your agent. Use the authoring guide, then run the verification command so technical checks and renders are recorded.'},
 {title:'Submit it',body:'Sign in with your email and submit the model from the member site. Files stay private while they are processed and reviewed.'},
 {title:'Automatic checks',body:'An isolated processor rebuilds the recipe and checks geometry, files and sizes. A content scan renders the model from several angles and reads its text to flag offensive shapes or words for the reviewer. Submitted code never runs on the website itself, and the scan can only flag, never approve.'},
 {title:'Human review',body:'An independent reviewer checks the visuals, portability, source and provenance. You cannot review your own model. Every model, from every contributor, gets this full human review.'},
 {title:'Published',body:'Approved models appear in the catalog with their source, licence and review record. Anyone can download them. A signed-in member can vote or report a problem.'},
];

export const moderation:Step[]=[
 {title:'Members',body:'A free account is required to submit a model, vote, follow, save a favourite, or report a problem. Browsing and downloading published models does not require an account.'},
 {title:'Contributors',body:'Members who submit models. A good track record of accepted models is how contributors become known to the review team.'},
 {title:'Reviewers and moderators',body:'Trusted contributors are invited to review or moderate by an administrator. Moderators handle reports, withdraw problem models and decide appeals. They cannot act on their own content or grant roles.'},
 {title:'Fair process',body:'Every report needs a reason, every decision is recorded, and restricted members can appeal. Nobody can buy, vote or sign up their way into review or publication.'},
];

export const comparison:Array<[string,string,string]>=[
 ['Generator source','Open, Apache-2.0','Closed'],
 ['Who adds models','Anyone, human-reviewed','The original team'],
 ['Editable controls','Every recipe model','Remixable assets'],
 ['Export formats','GLB, OBJ + MTL, FBX and USDZ','GLB, FBX, USDZ and OBJ'],
 ['Machine-readable model files','Controls JSON, llms.txt and prompt.txt','JSON, llms.txt and prompt.txt'],
 ['Works offline with your agent','Local toolkit','Hosted CDN and API'],
 ['Price','Free','Low poly free, HD paid'],
];

export const emailSourceLinks:Array<[string,string]>=[
 ['server/mail.ts','https://github.com/Dt51-51/celadon-lowpoly/blob/main/server/mail.ts'],
 ['server/auth.ts','https://github.com/Dt51-51/celadon-lowpoly/blob/main/server/auth.ts'],
];
export const emailUseParagraphs=[
 'Browsing the catalog and downloading a published GLB do not need an account or an email.',
 'An email is required only for an account. An account is required to upload or submit a model. Votes, follows, favourites, reports, review, moderation, and the account page stay signed in.',
 'Sign-in sends one email: a single-use link, subject "Sign in to Celadon Lowpoly", that expires in five minutes. The same link creates the account the first time. There is no password.',
 'The address is stored on the account so the next link goes to the same person, and so an admin can find that account in member search if it is misused. Other members do not see the address. You see it on your account page. Admins see it in member administration.',
 'That sign-in link is the only mail the code sends. There is no newsletter and no marketing. Resend delivers that one message, so Resend sees the address and the link for delivery. The link token is stored hashed, and login mail is rate limited. A spare address is fine.',
];
export const faq:Faq[]=[
 {question:'What is Celadon Lowpoly?',answer:'An open-source toolkit and community catalog of editable, recipe-based 3D models. A recipe is a small program with typed controls that rebuilds the model when you change it.'},
 {question:'How is it different from other catalogs?',answer:'Celadon Lowpoly is open source, anyone can contribute recipes, every published model is human-reviewed, and you always get the editable recipe, not only a mesh.'},
 {question:'Do I need an account?',answer:'Not for the local toolkit, and not to browse or download published models. Sign in with a free email link to vote, follow, save a favourite, report a model, or submit your own.'},
 {question:'What is my email used for?',answer:emailUseParagraphs.join(' '),links:emailSourceLinks},
 {question:'Which engines are supported?',answer:'Every model downloads as GLB, OBJ + MTL, FBX (binary 7.4) or USDZ, so Unity, Godot, Unreal, Blender, three.js and Apple Quick Look can all open it. All formats use meters with +Y up. Two characters, a humanoid and a fox, keep their skeletons and walk and idle clips in the GLB.'},
 {question:'Can my agent read a model’s controls?',answer:'Yes. Each model comes with a controls JSON file listing every knob with its range, default, unit and current value, plus materials and real-world size. The toolkit writes the same file for local builds, and the llms.txt and prompt.txt files in the repository explain the project to agents.'},
 {question:'How do I become a moderator?',answer:'Contribute good models and help with reports. Administrators invite trusted contributors to review or moderate. Roles cannot be requested through signup or votes.'},
 {question:'Is it free?',answer:'Yes. The toolkit and source are Apache-2.0, and membership is free. Each model shows its own licence and notices; keep them with your project.'},
 {question:'Where is the source code?',answer:'The toolkit archive contains the full engine and recipe sources. The entire project is open source and hosted on GitHub at https://github.com/Dt51-51/celadon-lowpoly.'},
];
