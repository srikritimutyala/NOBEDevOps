import { useEffect, useState } from "react";

export default function AdminUI() {
    //Setting default values for original display dropdowns
    const [form, setForm] = useState({
        name: "",
        event_type: "PROFESSIONAL",
        points: 0,
        is_mandatory: false,
        date: "",
        committee_id: "",
        project_id: "",
        created_at: ""
    });
    //Status label, creates variable that shows if event was created
    const [message, setMessage] = useState("");
    //Set default timestamp when page opens
    useEffect(() => {
        //New Date object representing current time
        const now = new Date();
        //Adds 0s to dates that require 0s at beginning
        const pad = (n: number) => String(n).padStart(2, "0");
        //Sets format for date and time
        const formatted =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        //Update "created_at" variable
        setForm(prev => ({...prev, created_at: formatted}));
    //Run only when component first loads
    }, []);
    //Handles admin typing in any input field, e=event
    function change(e: any) {
        //e.target is typed in input, extract four properties from input: 
        //  name, value, type, checked
        const { name, value, type, checked } = e.target;
        //Updates "form" React state
        setForm(prev => ({
            //Copy old values
            ...prev,
            //Only update the field we changed
            [name]: type === "checkbox" ? checked : value
        }));
    }
    //Runs when admin submits an event, e=event
    function handleSubmit(e: any) {
        //Prevents losing React state and prevents browser reloading the page
        e.preventDefault();
        //Prints our data to the browser developer console, temporary line for debugging, replace with supabase
        console.log("Form submitted:", form);
        //Updates message state, shows if event was created successfully
        setMessage("Event created!");
    }
    //What appears in our display
    return (
        <div>
            //Header for the website
            <h2>Create Event</h2>
            //Goes to submit function when submit button is pressed
            <form onSubmit={handleSubmit}>
                //Name input field
                <div>
                    <label>Name:</label><br />
                    <input name="name" value={form.name} onChange={change} />
                </div>
                //Event type dropdown
                <div>
                    <label>Event Type:</label><br />
                    <select name="event_type" value={form.event_type} onChange={change}>
                        <option value="PROFESSIONAL">PROFESSIONAL</option>
                        <option value="PHILANTHROPY">PHILANTHROPY</option>
                        <option value="SOCIAL">SOCIAL</option>
                        <option value="GENERAL_MEETING">GENERAL_MEETING</option>
                        <option value="NEW_MEMBER_WORKSHOP">NEW_MEMBER_WORKSHOP</option>
                        <option value="PROJECT_MEETING">PROJECT_MEETING</option>
                        <option value="OTHER_MANDATORY">OTHER_MANDATORY</option>
                    </select>
                </div>
                //Points input field
                <div>
                    <label>Points:</label><br />
                    <input
                        type="number"
                        name="points"
                        value={form.points}
                        onChange={change}
                    />
                </div>
                //Mandatory or not checkbox
                <div>
                    <label>Mandatory:</label>
                    <input
                        type="checkbox"
                        name="is_mandatory"
                        checked={form.is_mandatory}
                        onChange={change}
                    />
                </div>
                //Date input field
                <div>
                    <label>Date:</label><br />
                    <input
                        type="datetime-local"
                        name="date"
                        value={form.date}
                        onChange={change}
                    />
                </div>
                //Committee ID input field
                <div>
                    <label>Committee ID:</label><br />
                    <input
                        name="committee_id"
                        value={form.committee_id}
                        onChange={change}
                    />
                </div>
                //Project ID input field
                <div>
                    <label>Project ID:</label><br />
                    <input
                        name="project_id"
                        value={form.project_id}
                        onChange={change}
                    />
                </div>
                //Shows time event was created
                <div>
                    <label>Created At:</label><br />
                    <input
                        type="datetime-local"
                        name="created_at"
                        value={form.created_at}
                        onChange={change}
                    />
                </div>
                <br />
                <button type="submit">Create Event</button>
            </form>
            {message && <p>{message}</p>}
        </div>
    );
}
