import type { AppData, Chapter, Subject, Topic } from '@/lib/domain/types';
import { makeId } from '@/lib/domain/id';
import { makeBuiltinTags } from '@/lib/domain/builtinTags';

// Source of truth: docs/ESE-Civil-Engineering-Syllabus.md (UPSC ESE Civil, 2026).
// 12 technical subjects + General Studies & Engineering Aptitude (Prelims Paper I).
// Bold sub-sections in the syllabus become Chapters; detailed bullets become Topics.
interface SeedSubject {
  name: string;
  color: string;
  icon: string;
  chapters: { name: string; topics: string[] }[];
}

const SYLLABUS: SeedSubject[] = [
  {
    name: 'Building Materials',
    color: '#eab308',
    icon: 'Boxes',
    chapters: [
      {
        name: 'Materials & Concrete Technology',
        topics: [
          'Stone, Lime, Glass, Plastics, Steel, FRP, Ceramics, Aluminium, Fly Ash, Bricks, Aggregates & Timber — classification, properties & selection',
          'Basic Admixtures — types and applications',
          'Cement — types, composition, properties, uses, specifications & tests',
          'Lime & Cement Mortars and Concrete — properties and tests',
          'Design of Concrete Mixes — proportioning of aggregates & mix design methods',
        ],
      },
    ],
  },
  {
    name: 'Solid Mechanics',
    color: '#ef4444',
    icon: 'Dumbbell',
    chapters: [
      {
        name: 'Solid Mechanics',
        topics: [
          'Elastic constants',
          'Stress and plane stress',
          'Strains and plane strain',
          "Mohr's circle of stress and strain",
          'Elastic theories of failure',
          'Principal stresses',
          'Bending, Shear and Torsion',
        ],
      },
    ],
  },
  {
    name: 'Structural Analysis',
    color: '#f97316',
    icon: 'Building2',
    chapters: [
      {
        name: 'Structural Analysis',
        topics: [
          'Basics of strength of materials',
          'Types of stresses and strains',
          'Bending moments and shear force',
          'Concept of bending and shear stresses',
          'Analysis of determinate and indeterminate structures',
          'Trusses, beams, plane frames',
          'Rolling loads and Influence Lines',
          'Unit load method and other methods',
          'Free and forced vibrations of SDOF & MDOF systems',
          'Suspended cables',
          'Concepts and use of computer-aided design',
        ],
      },
    ],
  },
  {
    name: 'Design of Steel Structures',
    color: '#64748b',
    icon: 'Frame',
    chapters: [
      {
        name: 'Steel Design',
        topics: [
          'Principles of Working Stress method',
          'Design of tension and compression members',
          'Design of beams and beam-columns',
          'Design of connections',
          'Design of built-up sections & girders',
          'Industrial roofs',
          'Principles of Ultimate Load Design',
        ],
      },
    ],
  },
  {
    name: 'Design of Concrete & Masonry Structures',
    color: '#10b981',
    icon: 'Building',
    chapters: [
      {
        name: 'RCC, Prestressed & Masonry Design',
        topics: [
          'Limit State Design for bending, shear, axial compression & combined forces',
          'Design of beams, slabs, lintels, foundations, retaining walls, tanks, staircases',
          'Principles of Prestressed Concrete Design — materials & methods',
          'Earthquake resistant design of structures',
          'Design of masonry structures',
        ],
      },
    ],
  },
  {
    name: 'Construction Practice, Planning & Management',
    color: '#8b5cf6',
    icon: 'HardHat',
    chapters: [
      {
        name: 'Construction Planning & Management',
        topics: [
          'Construction planning, equipment, site investigation & management',
          'Estimation with project management tools & network analysis',
          'Analysis of rates of various types of works',
          'Tendering process and contract management',
          'Quality control, productivity & operation cost',
          'Land acquisition',
          'Labour safety and welfare',
        ],
      },
    ],
  },
  {
    name: 'Flow of Fluids, Hydraulic Machines & Hydro Power',
    color: '#06b6d4',
    icon: 'Droplets',
    chapters: [
      {
        name: 'Fluid Mechanics, Open Channel & Pipe Flow',
        topics: [
          'Fluid properties',
          'Dimensional analysis and modeling',
          'Fluid dynamics — flow kinematics and measurements',
          'Flow net',
          'Viscosity, boundary layer & control, drag, lift',
          'Principles in open channel flow & flow controls',
          'Hydraulic jump, surges',
          'Pipe networks',
        ],
      },
      {
        name: 'Hydraulic Machines & Hydro Power',
        topics: [
          'Various pumps, air vessels',
          'Hydraulic turbines — types, classification & performance parameters',
          'Power house — classification and layout',
          'Storage, pondage',
          'Control of supply',
        ],
      },
    ],
  },
  {
    name: 'Hydrology & Water Resources Engineering',
    color: '#0ea5e9',
    icon: 'CloudRain',
    chapters: [
      {
        name: 'Hydrology',
        topics: [
          'Hydrological cycle',
          'Ground water hydrology, well hydrology & data analysis',
          'Streams and their gauging',
          'River morphology',
          'Floods, droughts and their management',
          'Capacity of reservoirs',
        ],
      },
      {
        name: 'Water Resources Engineering',
        topics: [
          'Multipurpose uses of water',
          'River basins and their potential',
          'Irrigation systems & water demand assessment',
          'Storage and their yields',
          'Water logging, canal and drainage design',
          'Gravity dams, falls, weirs, energy dissipaters, barrage',
          'Distribution, cross-drainage & head-works and their design',
          'Concepts in canal design, construction & maintenance',
          'River training, measurement & analysis of rainfall',
        ],
      },
    ],
  },
  {
    name: 'Environmental Engineering',
    color: '#14b8a6',
    icon: 'Leaf',
    chapters: [
      {
        name: 'Water Supply Engineering',
        topics: [
          'Sources, estimation, quality standards, testing & treatment of water',
          'Rural, industrial & institutional water supply',
          'Physical, chemical & biological characteristics & sources of water',
          'Pollutants in water and their effects',
          'Estimation of water demand',
          'Drinking water standards',
          'Water treatment plants',
          'Water distribution networks',
        ],
      },
      {
        name: 'Waste Water Engineering',
        topics: [
          'Domestic waste water — planning & design, sewage collection & disposal',
          'Plumbing systems',
          'Components and layout of sewerage system',
          'Domestic waste-water disposal system design',
          'Sludge management — treatment, disposal & reuse of effluents',
          'Design of sewage treatment plants',
          'Industrial waste waters and treatment plants',
        ],
      },
      {
        name: 'Solid Waste Management',
        topics: [
          'Sources & classification of solid wastes',
          'Planning and design of solid waste management systems',
          'Collection, transportation and disposal systems',
          'Sanitary landfill — design and operation',
          'Beneficial aspects — composting, energy recovery, recycling',
        ],
      },
      {
        name: 'Air, Noise Pollution & Ecology',
        topics: [
          'Sources and types of air pollution',
          'Air quality standards and monitoring',
          'Noise pollution — sources, standards and control',
          'Ecological concepts and environmental impact assessment',
          'Environmental legislation — Water Act, Air Act, Environment Protection Act',
        ],
      },
    ],
  },
  {
    name: 'Geo-technical & Foundation Engineering',
    color: '#a16207',
    icon: 'Mountain',
    chapters: [
      {
        name: 'Geo-technical Engineering',
        topics: [
          'Soil exploration — planning and methods',
          'Properties of soil — index properties, classification & tests',
          'Permeability & seepage — Darcy\'s law, flow nets',
          'Compressibility and consolidation — Terzaghi\'s theory',
          'Shearing resistance — Mohr-Coulomb criterion, tests',
          'Earth pressure theories — Rankine, Coulomb',
          'Stress distribution in soil — Boussinesq equation',
          'Properties and uses of geo-synthetics',
        ],
      },
      {
        name: 'Foundation Engineering',
        topics: [
          'Types of foundations & selection criteria',
          'Bearing capacity of soils — Terzaghi & IS methods',
          'Settlement analysis — immediate, consolidation & secondary',
          'Design of shallow foundations — isolated, combined, raft',
          'Design and testing of deep foundations — piles and well foundations',
          'Slope stability analysis',
          'Design of earthen embankments, dams & earth retaining structures',
          'Principles of ground modifications — compaction, grouting, stone columns',
        ],
      },
    ],
  },
  {
    name: 'Surveying & Geology',
    color: '#3b82f6',
    icon: 'Compass',
    chapters: [
      {
        name: 'Surveying',
        topics: [
          'Classification of surveys and various methodologies',
          'Instruments and analysis of measurement of distances, elevation & directions',
          'Chain surveying and compass traversing',
          'Levelling — types and methods',
          'Theodolite surveying — horizontal and vertical angles',
          'Plane table surveying',
          'Field astronomy — determination of meridian, azimuth & time',
          'Global Positioning System (GPS) and GNSS',
          'Map preparation — contours and topographic mapping',
          'Photogrammetry and remote sensing concepts',
          'Survey layout for culverts, canals, bridges, road/railway alignment & buildings',
          'Setting out of curves — simple, compound and reverse',
        ],
      },
      {
        name: 'Geology',
        topics: [
          'Basic engineering geology — minerals and rocks',
          'Geological structures — folds, faults, joints and unconformities',
          'Geological maps and their interpretation',
          'Application of engineering geology in projects — dams, tunnels, foundations',
          'Rock mass classification — RMR and Q-system',
        ],
      },
    ],
  },
  {
    name: 'Transportation Engineering',
    color: '#ec4899',
    icon: 'TrafficCone',
    chapters: [
      {
        name: 'Highways',
        topics: [
          'Planning & construction methodology — road development plans',
          'Alignment and geometric design — sight distance, horizontal & vertical curves',
          'Traffic surveys and controls — volume, speed & origin-destination studies',
          'Traffic signals and road markings',
          'Principles of flexible pavement design — CBR method, IRC guidelines',
          'Principles of rigid pavement design — Westergaard\'s theory',
          'Pavement materials — bitumen, aggregates & tests',
        ],
      },
      {
        name: 'Tunneling',
        topics: [
          'Alignment of tunnels — factors governing selection',
          'Methods of construction — cut & cover, NATM, TBM',
          'Disposal of muck',
          'Drainage, lighting and ventilation of tunnels',
        ],
      },
      {
        name: 'Railway Systems',
        topics: [
          'Railway terminology — gauge, gradient, curves',
          'Planning and design of railway tracks',
          'Maintenance practices — track geometry and defects',
          'Track modernization — high-speed corridors',
        ],
      },
      {
        name: 'Harbours & Airports',
        topics: [
          'Harbour terminology — breakwaters, jetties, quays',
          'Harbour layouts and planning',
          'Airport layout — runway, taxiway, apron & terminal',
          'Airport planning and design — capacity and configuration',
          'Runway orientation — wind rose diagram',
        ],
      },
    ],
  },
  {
    name: 'General Studies & Engineering Aptitude',
    color: '#6366f1',
    icon: 'Newspaper',
    chapters: [
      {
        name: 'General Studies & Current Affairs',
        topics: [
          'Current issues of national & international importance (social, economic, industrial)',
          'Ethics and values in the engineering profession',
          'Basics of Energy and Environment — conservation, pollution, climate change',
          'Environmental impact assessment',
        ],
      },
      {
        name: 'Engineering Aptitude & Mathematics',
        topics: [
          'Logical Reasoning & Analytical Ability',
          'Engineering Mathematics — Linear Algebra',
          'Engineering Mathematics — Calculus & Differential Equations',
          'Engineering Mathematics — Probability & Statistics',
          'Numerical Analysis and numerical methods',
        ],
      },
      {
        name: 'Design, Standards & Project Management',
        topics: [
          'General Principles of Design, Drawing & importance of Safety',
          'Standards and Quality practices in production, construction, maintenance & services',
          'Basics of Project Management — PERT/CPM, scheduling',
          'Basics of Material Science and Engineering',
          'ICT-based tools and their applications in engineering (networking, e-governance)',
        ],
      },
    ],
  },
];

export function seedData(): AppData {
  const subjects: Record<string, Subject> = {};
  const chapters: Record<string, Chapter> = {};
  const topics: Record<string, Topic> = {};
  const subjectOrder: string[] = [];
  const now = Date.now();

  SYLLABUS.forEach((subj, si) => {
    const sid = makeId();
    const chapterIds: string[] = [];
    subj.chapters.forEach((ch, ci) => {
      const cid = makeId();
      const topicIds: string[] = [];
      ch.topics.forEach((title, ti) => {
        const tid = makeId();
        topics[tid] = {
          id: tid, chapterId: cid, title, notes: '', order: ti,
          difficulty: 'Medium', priority: 'Medium',
          revisionHistory: [], createdAt: now, updatedAt: now,
        };
        topicIds.push(tid);
      });
      chapters[cid] = {
        id: cid, subjectId: sid, name: ch.name, order: ci,
        difficulty: 'Medium', priority: 'Medium', topicIds,
      };
      chapterIds.push(cid);
    });
    subjects[sid] = { id: sid, name: subj.name, color: subj.color, icon: subj.icon, order: si, chapterIds };
    subjectOrder.push(sid);
  });

  const { tags, tagOrder } = makeBuiltinTags();
  return { subjects, chapters, topics, subjectOrder, tags, tagOrder };
}
